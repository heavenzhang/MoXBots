# 非实现者审阅

本聊天simple_ux_review只读审源码、调用及14项新增回归；不实现、不操作共享CI或生产。继承父Agent模型，未指定额外模型/推理档位；用量/费用与节省时间未测量。

发现并关闭：

1. 重命名与正文解析顺序使旧路径复活：按content block顺序合并，已退休路径不会被后续旧链接重建，真实成功Write允许恢复；反例已覆盖。
2. 打开面板期间流式更新反复解析历史：Markdown结果改为WeakMap按文本对象及内容缓存；源码变化会失效。审阅者本机1.227MB合成历史冷解析约425ms，暖解析0.22～0.33ms；这是本机样本，不是正式性能基准。
3. 缓存Tab隐藏而非卸载，portal残留：active以Chat原useTabActive为权威，隐藏时卸载trigger/open state/portal，回到页面不自动打开；真实同实例回归通过。
4. 末页加载按钮消失导致键盘焦点落body：IAB复现后修复，保留原加载焦点且未移至其他控件时返回搜索。IAB复验activeTag=INPUT，新增回归通过。

测试修正：首个末页回归使用renderWithTheme返回的裸rerender，误卸载Theme根；仅本测试文件改用稳定wrapper，再次独立14/14通过，未改全局helper或降低断言。最终diff --check通过，未发现剩余阻断。

实际文件可用性、预览IO、原生安装/发行仍按原owner分别验收。
