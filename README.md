# 个人工具箱

纯静态的个人工具导航页，工具列表由 `tools.json` 配置。

## 本地预览

页面通过 `fetch` 读取 `tools.json`，需要用 HTTP 服务访问（直接双击打开 `file://` 会读取失败）：

```bash
python3 -m http.server 8000
# 打开 http://localhost:8000
```

可直接部署到 GitHub Pages、Cloudflare Pages、Vercel 等任意静态托管。

## 配置 `tools.json`

```json
{
  "site": {
    "title": "个人工具箱",
    "subtitle": "副标题（可选）",
    "footer": "页脚文字（可选）"
  },
  "tools": [
    {
      "name": "工具名称",
      "description": "一句话介绍",
      "url": "tools/my-tool/",
      "icon": "assets/icons/my-tool.svg",
      "color": "#6366f1",
      "category": "分类",
      "tags": ["关键词"]
    }
  ]
}
```

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `name` | 是 | 工具名称 |
| `url` | 是 | 链接，可以是站内相对路径或外部网址（外链自动新标签页打开） |
| `description` | 否 | 简介，卡片中最多显示两行 |
| `icon` | 否 | 图标，见下方说明；留空则显示名称首字 |
| `color` | 否 | 主题色，用于图标及其底色、悬停描边 |
| `category` | 否 | 分类；有两个及以上分类时自动出现分类筛选 |
| `tags` | 否 | 额外的搜索关键词 |
| `iconTint` | 否 | 设为 `false` 时 SVG 保持原色，不按主题色着色 |
| `iconFit` | 否 | 设为 `"cover"` 时位图铺满图标框（适合 logo 图片） |
| `newTab` | 否 | 设为 `true` 时站内链接也在新标签页打开 |
| `hidden` | 否 | 设为 `true` 时暂不显示 |

### 图标

- **SVG 路径/URL**：默认按 `color` 单色着色，任意尺寸自动适配；建议使用线条/单色图标（如 [Lucide](https://lucide.dev)、[Tabler](https://tabler.io/icons)）。
- **位图路径/URL**（png / jpg / webp…）：等比缩放居中显示；加载失败时回退为首字。
- **Emoji 或文字**：例如 `"🎵"`，直接显示。

图标尺寸随卡片宽度自适应，并支持系统深色模式。

## 添加新工具

1. 在 `tools/<工具名>/` 下放入工具页面（独立的静态页面即可，可引用 `../../assets/style.css` 保持风格一致）。
2. 图标放到 `assets/icons/`。
3. 在 `tools.json` 的 `tools` 数组中加一项。

## 当前状态

`tools.json` 中暂为占位数据（示例工具 A–F，链接为 `#`），用于预览布局与图标效果，之后替换为真实工具。
