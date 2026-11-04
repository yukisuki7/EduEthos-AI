# 课程参考知识库（公开副本）

`runtime/generated/documents.json` 保存当前脱敏检索片段；`runtime/retrieval.mjs` 提供检索实现。部署副本位于 `../course-demo/worker/`。

仅保留教学大纲表2的课程内容，以及申报材料中的课程建设思路与教学设计片段。建设计划、预期成效和未核实案例不作为已证事实。资料版本不代表当前学校执行规则。

原始 DOCX/PDF、完整提取文本、`chunks.jsonl` 和原始 `sources.json` 含个人信息或本地路径，未随公开仓库发布。`runtime/generated/sources.json` 只保留来源类别与相对定位，指向的原件不在仓库中。

## 运行与检查

```powershell
node runtime/check-retrieval.mjs
cd ../course-demo
node scripts/sync-knowledge.mjs
node scripts/build-worker.mjs
```

## 更新资料

`scripts/extract_sources.py` 和 `runtime/prepare.mjs` 保留用于本地处理。重新生成需要自行准备具有使用权限的原件和中间文件；先检查并脱敏，再公开生成的片段。公开片段不附带额外的再分发授权。
