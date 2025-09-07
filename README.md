### mitmproxy 相關指令
- 執行腳本、將流量即時寫入到指定的檔案中(攔截特定網站)
    ```
    mitmproxy -s script.py -w session.dump --allow-hosts example.com
    ```
- 離線讀取封包檔(可設定鼠標)
    ```
    mitmproxy -r session.dump --set console_mouse=false
    ```
- 用 Web 介面查看
    ```
    mitmweb -s script.py -w session.dump --allow-hosts example.com
    ```
- 不啟動代理伺服器
    ```
    mitmdump -n -r session.dump
    ```
- 詳細模式(verbose)
    ```
    mitmproxy -v
    ```

- 過濾執行：只對特定流量執行腳本
    ```
    mitmdump -s your_script.py "~m POST & ~u /api/login"
    ```