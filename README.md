# ศูนย์รวมระบบสารสนเทศ (Google Apps Script + Sheets + Drive)

เว็บแอปพอร์ทัลรวมลิงก์ระบบสารสนเทศ (Clean Template) ที่ใช้ **Google Sheets** เป็นฐานข้อมูล และ **Google Drive** เป็นพื้นที่จัดเก็บรูปภาพ พร้อมระบบ **Admin PIN** ล็อกโหมดแก้ไขและหน้า **ตั้งค่าเว็บไซต์**

## ทรัพยากรที่เชื่อมต่อไว้ในโค้ดแล้ว
- **Google Sheet (`Portal_Database`)**: `1LlcDf7I3LllBzob4vSG5AEC3kVDcUJDedt4HsiKcF8Y`
  - [เปิด Google Sheet](https://docs.google.com/spreadsheets/d/1LlcDf7I3LllBzob4vSG5AEC3kVDcUJDedt4HsiKcF8Y/edit)
- **โฟลเดอร์เก็บรูปภาพ (`Portal_Images`)**: `1iyw_3BpZAiGd1foKfBpB8B1YjaZhVWZA`
- **รหัสผ่านแอดมินเริ่มต้น (Admin PIN)**: `1234` *(แนะนำให้เปลี่ยนทันทีหลังเปิดเว็บครั้งแรก)*

---

## วิธี Deploy อัตโนมัติจาก GitHub (ไม่ต้องใช้คอมพิวเตอร์)

โปรเจกต์นี้ติดตั้ง **GitHub Actions** (`.github/workflows/deploy-gas.yml`) ไว้ให้แล้ว เพียงตั้งค่าสิทธิ์ครั้งแรกครั้งเดียวผ่านเบราว์เซอร์บนมือถือ/แท็บเล็ต:

1. เปิด **Google Apps Script API** ที่ [script.google.com/home/usersettings](https://script.google.com/home/usersettings) (เปิดสวิตช์เป็น **On**)
2. ในหน้า Repository นี้ กดปุ่มเขียว **`<> Code`** > แท็บ **Codespaces** > **Create codespace on main**
3. ใน Terminal ของ Codespaces รันคำสั่ง:
   ```bash
   npm install -g @google/clasp
   clasp login --no-localhost
   ```
   *(เปิดลิงก์ Google Login ที่แสดงขึ้นมา กดอนุญาต แล้วนำโค้ด/URL กลับมาวางใน Terminal)*
4. ดูค่า Token และคัดลอกเก็บไว้:
   ```bash
   cat ~/.clasprc.json
   ```
5. สร้างโปรเจกต์ Apps Script และ Deploy ครั้งแรก:
   ```bash
   clasp create --type webapp --title "Portal ระบบสารสนเทศ"
   clasp push --force
   clasp deploy
   ```
   - ดูค่า `scriptId` ด้วยคำสั่ง `cat .clasp.json`
   - ดูค่า `DEPLOYMENT_ID` (`AKfycb...`) จากผลลัพธ์ของ `clasp deploy`
6. นำค่าไปใส่ใน GitHub Repository > **Settings > Secrets and variables > Actions > New repository secret**:
   - `CLASPRC_JSON`: ข้อความ JSON จาก `~/.clasprc.json`
   - `SCRIPT_ID`: ค่า `scriptId` จาก `.clasp.json`
   - `DEPLOYMENT_ID`: รหัส `AKfycb...` จาก `clasp deploy`

หลังจากนี้ ทุกครั้งที่แก้ไขโค้ดบน GitHub ระบบจะ Push & Deploy ไปยัง Web App URL เดิมให้อัตโนมัติ!
