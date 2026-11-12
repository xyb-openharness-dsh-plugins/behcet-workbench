// 插件身份与落点常量的唯一来源。
//
// 为什么单独一个文件：宿主路由、服务端数据库文件名、测试和检查器都要用同一组值。
// 抄第二份就会漂移（家族教训：前缀带/不带尾斜杠，装机后 /ui 本身 404）。

/** 宿主 API 前缀（webServer.register 的 path） */
export const API_PREFIX = 'behcet'

/** 宿主形态的 API 根：页面拼 `/api/behcet/api/...` */
export const API_BASE = `/api/${API_PREFIX}`

/** 业务界面入口（与 lib/client.js 的 iframe src 对齐） */
export const UI_ENTRY = `/api/${API_PREFIX}/ui/`

/** 数据根下的 sqlite 文件名。换目录时只换根，文件名不变。 */
export const DB_FILE = 'behcet.sqlite'