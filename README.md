### mitmproxy 安裝步驟
> 此為 win11 的安裝步驟
1. 安裝並啟動 mitmproxy
    ```python
    pip install mitmproxy
    mitmproxy
    ```
2. 調整瀏覽器或本機的網路設定，連接至 mitmproxy（IP: 127.0.0.1 port: 8080）
    > 可以使用 firefox ，改變瀏覽器 proxy 設定即可
3. 使用瀏覽器開啟 http://mitm.it，下載對應的 CA 憑證
4. 使用憑證匯入精靈
    - 在 **憑證存放區** 的步驟，選取 **將所有憑證放入以下的存放區**
    - 點擊 **瀏覽**，選擇 **受信任的跟憑證授權單位**

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