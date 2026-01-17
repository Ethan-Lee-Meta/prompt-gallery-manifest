0. 目标与边界
0.1 目标

上传任意素材（人像/风景/建筑/电影截图/产品/文档等）进入 Assets。

自动检测人脸并进行 同人分组（People）。

在每个 Person 下自动筛选 不同角度 的“最佳参考脸”（frontal / 左右3/4 / 左右侧脸 / 仰 / 俯），用于图生图“人脸参考”。

不下载：一键“Open folder”打开本机 refs 文件夹（Explorer/Finder），并可 Copy path。

允许人工校正：Exclude、Pin、Split outlier、Merge people。

0.2 非目标（本阶段不做）

训练自有大模型/大数据学习（可用预训练模型/传统算法即可）。

复杂权限体系（默认本地单用户）。

多机同步、云端协作（可后续扩展）。

1. 总体架构
1.1 组件拓扑

Web UI（Next.js）：你的画布 MVP 即 UI 原型，负责展示与操作。

UMK/FastAPI（本地 Agent + API）：

业务 API（assets/people/faces…）

Local Ops（/local/*）：打开文件夹、返回本地路径、ping

处理流水线（人脸检测、embedding、聚类、角度/质量评估、refs materialize）

SQLite：元数据与索引（资产、脸实例、人物、选择结果、审计事件）

文件系统（Local-first）：保存原图、缩略图、face crops、refs、manifest

1.2 数据流（核心闭环）

Upload → Asset 入库 → 内容分类(kind) →（若含人脸）Face detect → Face crop + embedding + pose + quality → Person 归属 → refs 选择（每桶 top1）→ materialize 到 people/<id>/refs/ → UI 点 Open folder 调 /local/people/{id}/refs:open

2. 目录契约（强烈建议先锁定）

目录契约是“无需下载、直接打开 folder”的基础。

建议根目录：UMK_STORAGE_ROOT（例如 E:\...\UMK\library）

library/
  assets/
    a000123/
      original.jpg
      thumb.jpg
      meta.json
      faces/
        f000001.jpg
        f000002.jpg
  people/
    p001/
      refs/
        frontal.jpg
        l3q.jpg
        r3q.jpg
        lprofile.jpg
        rprofile.jpg
        up.jpg
        down.jpg
        manifest.json
      cache/
        cover.jpg
      audit.log (可选)


关键规则：

asset 的 face crop 放在 assets/<asset_id>/faces/<face_id>.jpg

person 的 refs 输出固定命名：<bucket>.jpg（便于即梦/nano banana 直接拖文件夹）

manifest.json 记录每个 bucket 的来源 face_instance / asset / bbox / score / pose（可追溯）

3. 数据模型（SQLite）

下面是推荐的最小表集合（满足 MVP + 可扩展）。

3.1 assets

id (PK)

sha256（可选但强烈建议，用于去重/稳定引用）

kind（person/landscape/…）

filename、ext、bytes、width、height

source（批次、上传来源）

storage_relpath（如 assets/a000123/original.jpg）

thumb_relpath

created_at

索引：

(kind, created_at)

sha256 UNIQUE（开启去重时）

3.2 face_instances

每张图可有 0..N 张脸

id (PK)

asset_id (FK)

bbox_x, bbox_y, bbox_w, bbox_h（像素）

face_crop_relpath（assets/<asset_id>/faces/<face_id>.jpg）

embedding（BLOB/bytes 或外部向量索引键）

embed_dim

quality_score（0..1）

yaw, pitch, roll（度）

bucket（frontal/l3q/...）

excluded bool

pinned bool

created_at

索引：

(asset_id)

(bucket)

(quality_score DESC)

(excluded, pinned)

embedding 存储策略见第 6 节：MVP 可先存 BLOB + 线性扫描，后续换 ANN 索引。

3.3 people

id (PK)

display_name

status（Verified/Needs Review/Noise）

confidence（聚类一致性/置信度）

cover_face_id（用于 People 卡片头像）

faces_count、assets_count

created_at

3.4 person_memberships

把 face_instance 归到 person

person_id (FK)

face_id (FK)

match_score（embedding 距离或相似度）

assigned_by（auto/manual/merge/split）

created_at

主键可用 (person_id, face_id) 或单独 id

索引：

(face_id)

(person_id)

3.5 person_refs（每桶代表图选择结果）

person_id (FK)

bucket（frontal/l3q/...）

face_id (FK)

selected_by（auto/manual）

selected_at

主键 (person_id, bucket) 唯一

3.6 audit_events（可选但推荐）

记录 merge/split/exclude/pin/verify 等变更，便于回放与调试。

id PK

type（MERGE/SPLIT/EXCLUDE/PIN/VERIFY/AUTOPICK/...）

payload_json

created_at

4. API 设计（对齐你画布 MVP）
4.1 Local Ops（必须）

这三条就是你 MVP 前端已经在调用的契约：

GET /local/ping
返回 {ok, agent, version}

GET /local/people/{person_id}/refs-folder
返回 {person_id, path}（绝对路径；服务端计算，不允许前端随便传路径）

POST /local/people/{person_id}/refs:open
Body：{ prepare: bool, reveal: bool }
返回 {ok, path, prepared}
行为：

prepare=true：materialize refs（写入 per-bucket jpg + manifest）

reveal=true：打开文件夹（Explorer/Finder）

安全要点：

服务端严格校验 person_id，并保证路径必须位于 UMK_STORAGE_ROOT 下

FastAPI 只监听 127.0.0.1，CORS 仅允许你的前端 origin

4.2 业务 API（建议下一步补齐）

为了从“模拟数据”走向真实数据，最小需要：

Assets

POST /assets/upload（multipart）→ 返回 asset_id

GET /assets（分页 + kind filter + search）

GET /assets/{asset_id}（详情 + faces 简要）

People

GET /people（分页 + search + status filter）

GET /people/{person_id}（详情：coverage、refs、统计）

POST /people/{person_id}/autopick（重新挑 refs）

POST /people/merge（{target, sources[]}）

POST /people/{person_id}/verify

Faces（人工校正）

POST /faces/{face_id}/exclude（{excluded}）

POST /faces/{face_id}/pin（{pinned}）

POST /faces/{face_id}/move（{to_person_id | new_person:true}）

POST /people/{person_id}/refs（{bucket, face_id} 手工指定）

5. 处理流水线（Pipeline 细化）
5.1 内容分类（非人像也要分组）

输入：原图
输出：asset.kind（可多标签：kind + tags）

MVP 推荐策略（不需要大数据训练）：

规则优先：文件夹/批次/用户手动 tag

轻量模型：CLIP embedding + 简单分类头 或 近邻到若干“参考类向量”

保底：unknown → 后续人工修正

你画布里的 Assets 已支持 kind 过滤，后端只要给出 kind 即可。

5.2 人脸检测与对齐

当 kind == person 或 unknown 时：

运行 face detector：输出 bbox + landmarks

对齐/裁剪 face crop（固定尺寸如 256x256）

写入 assets/<asset_id>/faces/<face_id>.jpg

5.3 embedding 生成（同人分组的核心）

对每个 face crop：

计算 embedding（如 512 维 float32）

保存到 face_instances.embedding（MVP）或向量索引（后续）

5.4 姿态估计（角度桶）

由 landmarks 做 head pose（PnP）或模型直接输出 yaw/pitch/roll
然后映射 bucket（可配置）：

frontal：|yaw|<=15 且 |pitch|<=10

l3q：yaw ∈ [-45,-15]

r3q：yaw ∈ [15,45]

lprofile：yaw <= -45

rprofile：yaw >= 45

up：pitch >= 10（可与 yaw 同时存在时按优先级处理）

down：pitch <= -10

你的 MVP 已有 bucket 概念（frontal/l3q/…），后端只需稳定输出即可。

5.5 质量评分（自动选“最好参考图”）

quality_score ∈ [0,1]，建议由多个分项组成：

清晰度：Laplacian variance（模糊度）

人脸大小：bbox 面积占比（太小扣分）

遮挡：landmarks/关键点置信度、眼睛/嘴巴可见性

光照：过曝/欠曝比例

姿态惩罚：yaw/pitch 极端扣分（同时与 strictness 交互）

你画布里 strictness 的作用建议如下：

selection_score = quality_score - strictness * pose_penalty

pose_penalty 可用 (abs(yaw)+0.6*abs(pitch))/120

5.6 归组（Person Assignment）

增量归组策略（MVP → 可扩展）：

MVP（简单、可用）

对新 face embedding：

在已存在 person 的 “代表 embedding 集合” 中线性扫描（或按最近 N 个 face）

找到最小距离 dmin

若 dmin <= match_threshold → 加入该 person

否则创建新 person

扩展（大量数据时）

为所有 embeddings 建立 ANN 索引（hnswlib/faiss）

person 维护 centroid + 方差，快速估计一致性与置信度

6. Refs 自动选择与 Materialize（对应 “Open folder”）
6.1 自动选择（每 bucket 选 1 张）

对每个 person：

收集未 excluded 的 face_instances

按 bucket 分组

每个 bucket 按 selection_score 排序：

pinned 优先（pinned 的 face 若在该 bucket，则直接选）

否则选 score 最高的 face

写入 person_refs(person_id,bucket)->face_id

6.2 materialize 到文件夹

当 UI 调用 POST /local/people/{id}/refs:open 且 prepare=true：

确保目录存在：people/<id>/refs/

对每个 bucket：

找到 person_refs.face_id

读取 face crop 源文件

输出为 refs/<bucket>.jpg（统一命名）

写 manifest.json，包含：

bucket -> face_id -> asset_id

bbox、yaw/pitch/roll、quality_score、selected_by/at

版本号/算法参数（threshold/strictness）用于可追溯

然后 reveal=true 时调用 OS 打开目录。

7. Local Agent（FastAPI）实现要点
7.1 OS 打开文件夹

Windows：explorer.exe <path>

macOS：open <path>

Linux：xdg-open <path>

必须：

路径必须落在 UMK_STORAGE_ROOT 下（防止被用于打开任意敏感目录）

person_id 白名单字符校验

7.2 CORS / 监听地址 / 令牌（推荐）

uvicorn：--host 127.0.0.1

CORS allowlist：http://127.0.0.1:2000（或你的 Next dev origin）

可选：X-Local-Agent-Token（前端从 env 读，后端比对）

8. 前端（对齐你画布 MVP）如何接入真实数据

你画布 MVP 目前是“模拟数据 + /local 调用”。上生产时的迁移路线：

保留当前 UI 信息架构：Assets / People / Person / Inspector

用真实 API 替换 mock：

Assets 列表来自 GET /assets

People 列表来自 GET /people

Person 详情来自 GET /people/{id}（含 refs、coverage、faces摘要）

Open folder / Copy folder 保持不变：继续调 /local/*

face 的 Pin/Exclude/Split/Set representative：

对应调 POST /faces/{id}/pin、POST /faces/{id}/exclude、POST /faces/{id}/move、POST /people/{id}/refs

9. 并发、性能与一致性（本地单机也要考虑）

入库与处理建议分两阶段：

upload 立即入 assets，返回 asset_id

后台任务处理 face/embedding/cluster（队列或线程池）

SQLite 写入要注意：

单写多读，批量插入 face_instances 与 memberships

WAL 模式（提升并发）

大量图片时：

优先生成 thumb，加速 UI

embedding/pose 可延后（lazy compute）

10. 最小验收（你可以直接用来做 Gate）

上传非人像：Assets 可见，kind 正确或可手动改；People 不增加。

上传人像（含单人）：People 新增 1 person，refs 自动生成至少 frontal。

上传同一人不同照片：归到同一 person；coverage 增长。

Person 页面点击 Open folder：

Agent online：打开 people/<id>/refs/，里面存在 <bucket>.jpg 与 manifest.json

Agent offline：UI toast fallback path + Copy path 可用

手动 Set representative（某 bucket）：再次 Open folder 后该 bucket 文件更新。

Exclude 某 face：不会再被 auto-pick；Pin 的 face 不会被覆盖。

Split outlier：新 person 创建并携带该 face。