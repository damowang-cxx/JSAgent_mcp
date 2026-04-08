# JS Reverser MCP

第一期最小可运行 TypeScript MCP server 骨架。

## 当前实现

- TypeScript + ESM 项目结构。
- 基于 `@modelcontextprotocol/sdk` 的 stdio MCP server。
- 统一工具定义与工具注册表。
- 基础 stderr logger。
- 统一工具错误结构。
- 3 个只读核心工具：
  - `ping`
  - `get_server_info`
  - `list_tools_summary`

## 当前未实现

第一期不包含浏览器控制、Puppeteer、Runtime、Collector、Hook、AI、任务工件等能力。

## 使用方式

```bash
npm install
npm run build
npm start
```

开发模式：

```bash
npm run dev
```

类型检查：

```bash
npm run typecheck
```

## 工具列表

### `ping`

返回健康检查结果。

参数：

```json
{
  "message": "optional string"
}
```

返回：

```json
{
  "ok": true,
  "tool": "ping",
  "pong": "pong",
  "timestamp": "2026-04-08T00:00:00.000Z"
}
```

### `get_server_info`

返回当前服务基本信息。

参数：

```json
{}
```

### `list_tools_summary`

返回当前已注册工具摘要。

参数：

```json
{}
```

## 第二期方向

第二期建议进入浏览器会话层，围绕浏览器生命周期、页面会话、Runtime 执行边界和后续采集能力建立独立模块，不把浏览器状态塞进第一期 core 工具层。
