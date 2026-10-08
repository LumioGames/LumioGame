---
status: completed
---

# Server Checkpoint IO Diagnostics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development to implement this plan task-by-task (hosts without subagents: its Inline Fallback section). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让检查点发布失败日志准确包含失败操作、generation、路径及原始OS错误，保留原有失败和恢复语义。

**Architecture:** 在Storage私有IO边界添加错误上下文，沿现有io::Result和DS错误字符串链自然传递。只补可观测性；不修改持久化格式、恢复策略、重试或发布时序。

**Tech Stack:** Rust 1.98.0，edition2021，lumio-server-storage，真实临时文件系统测试。

## Global Constraints

- 工作树C:/Work/LumioGames/.101-restore-01/LumioServer12CheckpointIoDiagnostics，base 008861074a2d3c9da1b0407325ede6f851704fd5；分支codex/101-checkpoint-io-diagnostics。
- 不触碰用户浏览器与当前18101/18105/18331现场，不触碰18081/18082/18084/18085/18092–18097；不启动DS，不换DLL，不修改Defender设置。
- 不reset/clean/覆盖还原；不减少玩家或Bot、不关体素、不降频、不放宽额度或协议校验、不改游戏guard掩盖生命周期问题。
- ADR142仍Owner Pending，不启用或发行Draft；不改公开Platform签名、schema pins或包身份。
- 不添加重试、sleep、线程、后台任务或吞错；不改变发布顺序、poisoned语义、generation推进、持久化字节和stable_code分类。
- 外层io::ErrorKind必须保留；原始io::Error作为source可追溯，原始raw OS code必须在日志与source链可取。包装后外层raw_os_error()可能为None，须明确记录，不虚称保留该方法返回值。
- 只有真实失败测试才算RED；编译错误和环境缺失不算RED。只提交本任务源和测试，Root独占101交付账本写入。

---

### Task 1: 发布写入步骤的准确错误归因

**Files:**
- Modify: `Storage/src/lib.rs` — private durable_write及CheckpointStore::publish的IO边界。
- Test: `Storage/src/lib.rs`现有tests模块，或相邻私有测试模块（遵守现有风格）。
- Read: `.spec/AGENTS.md`、`.spec/knowledge/README.md`、对应architecture/testing/code-style、`Application/ds/src/main.rs` save/FatalErrorfrom调用。

**Interfaces:**
- Consumes: `CheckpointStore::publish(&mut self, checkpoint: &Checkpoint) -> io::Result<u64>`；现有point/open/published_group测试夹具。
- Produces: 同一公开接口和错误分类；错误Display新增准确操作名、generation、path，rename含destination，source保留原始io::Error。durable_write私有签名可增加generation参数。

**Evidence:** 原始五份失败draft的manifest、runtime.bin、voxel.bin均完整，不能区分manifest sync_all与rename失败。原代码错误只有“拒绝访问。(os error 5)”，DS save将其to_string，故无法定位。此任务修的是错误归因缺口，不声称修复os-error-5根因。

- [x] **Step 1: 加真实文件系统失败测试，生产源不改，保存RED。**

```rust
#[test]
fn publish_rename_error_identifies_generation_paths_and_preserves_previous_group() {
    let dir = tempfile::tempdir().unwrap();
    let mut store = open(dir.path());
    assert_eq!(store.publish(&point(1)).unwrap(), 1);
    let previous = fs::read(published_group(dir.path(), 1).join("manifest.json")).unwrap();
    let destination = published_group(dir.path(), 2);
    fs::create_dir(&destination).unwrap();
    fs::write(destination.join("occupied"), b"keep").unwrap();
    let draft = store.draft_path(2);
    let error = store.publish(&point(2)).unwrap_err();
    let message = error.to_string();
    assert!(message.contains("operation=rename"), "{message}");
    assert!(message.contains("generation=2"), "{message}");
    assert!(message.contains(&draft.display().to_string()), "{message}");
    assert!(message.contains(&destination.display().to_string()), "{message}");
    assert_eq!(fs::read(destination.join("occupied")).unwrap(), b"keep");
    assert_eq!(fs::read(published_group(dir.path(), 1).join("manifest.json")).unwrap(), previous);
    assert!(draft.join("runtime.bin").is_file());
    assert!(draft.join("voxel.bin").is_file());
    assert!(draft.join("manifest.json").is_file());
    assert_eq!(store.next_generation, 2);
    assert!(store.poisoned);
    assert!(stable_code(&store.publish(&point(3)).unwrap_err().to_string()).is_some());
}
```

Run `cargo test -p lumio-server-storage publish_rename_error_identifies_generation_paths_and_preserves_previous_group -- --exact tests::publish_rename_error_identifies_generation_paths_and_preserves_previous_group --nocapture`; 如果实际模块名或测试过滤规则不匹配先纠正并确认执行1项，不能接受0测试。预期原代码缺operation上下文，断言失败raw非零。另加draft清理失败真实case：在draft路径创建普通文件，remove_dir_all必失败，断言operation=remove_draft、generation=1、路径明确，原有未poison行为保持。

- [x] **Step 2: 加最小私有错误类型及包装器。**

下列完整核心代码是起点，按Clippy与既有风格调整；字段/命名不是公开协议。Display必须先输出原始错误，以保留stable_code的前缀协议。

```rust
#[derive(Debug)]
struct CheckpointIoError {
    source: io::Error,
    operation: &'static str,
    generation: u64,
    path: PathBuf,
    destination: Option<PathBuf>,
}

impl std::fmt::Display for CheckpointIoError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{} [checkpoint_io operation={} generation={} path={}",
            self.source, self.operation, self.generation, self.path.display())?;
        if let Some(destination) = &self.destination {
            write!(f, " destination={}", destination.display())?;
        }
        write!(f, "]")
    }
}

impl std::error::Error for CheckpointIoError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        Some(&self.source)
    }
}

fn checkpoint_io(error: io::Error, operation: &'static str, generation: u64,
                 path: &Path, destination: Option<&Path>) -> io::Error {
    io::Error::new(error.kind(), CheckpointIoError {
        source: error, operation, generation, path: path.to_path_buf(),
        destination: destination.map(Path::to_path_buf),
    })
}

fn durable_write(path: &Path, bytes: &[u8], generation: u64) -> io::Result<()> {
    let mut file = File::create_new(path)
        .map_err(|error| checkpoint_io(error, "create_new", generation, path, None))?;
    file.write_all(bytes)
        .map_err(|error| checkpoint_io(error, "write_all", generation, path, None))?;
    file.sync_all()
        .map_err(|error| checkpoint_io(error, "sync_all", generation, path, None))
}
```

在publish现有各位置加map_err；不移动语句，不把draft清理移进poison closure，不改变generation/collect_section_partitions分支：

```rust
fs::remove_dir_all(&draft)
    .map_err(|error| checkpoint_io(error, "remove_draft", generation, &draft, None))?;
fs::create_dir(&draft)
    .map_err(|error| checkpoint_io(error, "create_draft", generation, &draft, None))?;
durable_write(&draft.join(RUNTIME_PAYLOAD_FILE), &checkpoint.runtime, generation)?;
// voxel分支和manifest调用同样仅增加generation参数。
self.durability.sync_directory(&draft)
    .map_err(|error| checkpoint_io(error, "sync_draft_directory", generation, &draft, None))?;
let published = self.published_path(generation);
fs::rename(&draft, &published)
    .map_err(|error| checkpoint_io(error, "rename", generation, &draft, Some(&published)))?;
self.durability.sync_directory(&self.root)
    .map_err(|error| checkpoint_io(error, "sync_root_directory", generation, &self.root, None))?;
```

- [x] **Step 3: 补原始错误与create_new回归，跑GREEN。**

使用已有文件调用新的durable_write签名，断言create_new失败包含路径/generation且不改已有字节。用真实失败检查source链有io::Error、kind相同、raw_os_error可取且Display包含该code；另用`io::Error::from_raw_os_error(5)`测试包装保留source/日志（此项是错误表示单测，不当os-error-5现场复现）。对`coded(CHECKPOINT_CORRUPT_MANIFEST, "test")`包装后调用stable_code，断言code仍为CHECKPOINT_CORRUPT_MANIFEST。WindowsSnapshotOnly成功原测试继续通过。不要通过放宽已有断言消除失败。

Run `cargo test -p lumio-server-storage -- --nocapture`，期望全部通过、raw0；`cargo clippy -p lumio-server-storage --all-targets -- -D warnings`、`cargo fmt --all -- --check`，期望raw0。若workspace未改文件有格式噪声，记录并用实际修改文件rustfmt check补定界，不格式化无关文件。保存所有原始退出码/日志，包括环境失败。

- [x] **Step 4: 自审、窄提交与报告。**

```powershell
git diff --check
git add Storage/src/lib.rs
git commit -m "fix(storage): identify checkpoint publish IO failures"
```

仅按实际新增测试文件补git add，禁止全量add。报告写到C:/Work/LumioGames/LumioGame/.run/20261006-confirmed-fixes-01/server-task-1-report.md，包含RED/GREEN命令与raw、执行数量、源SHA、commit、scope、真实OS失败与错误表示单测的区别、未运行/环境限制。不得宣称os-error-5根因修复或现场验收通过。Root随后生成全范围diff并独立复审，完成冻结后的跨任务最终审查；不自行推送或部署。
