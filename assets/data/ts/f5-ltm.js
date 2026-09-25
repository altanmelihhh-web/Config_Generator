'use strict';
// ─── Sorun giderme sihirbazı: ek senaryolar (f5-ltm) ───────────────────────────
// Kaynak: CLI Lab arıza bulguları (assets/data/labs/f5.js) ve araştırma notları. Hub derlemesinden (clibuild.js) bağımsızdır.
// Şema: { title, severity: 'err'|'warn'|'info', symptom, topic?, replaces?, lab?, steps: [{ code, desc, fix?: string | [{ cause, cmd? }] }] }
// Komutlar TMOS 16.1/17.x içindir; tmsh komutları tmsh içinde ya da bash'te "tmsh" önekiyle çalışır.
(function () {
    const root = typeof window !== 'undefined' ? window : globalThis;
    root.CG_TS_EXTRA = root.CG_TS_EXTRA || {};
    root.CG_TS_EXTRA['f5-ltm'] = [
        {
            title: 'BIG-IP Bir İç Ağa / Sunucu Ağına Ulaşamıyor: Arayüz, VLAN Etiketi ve Self IP', severity: 'err', topic: 'l2', lab: 'f5-05',
            symptom: 'BIG-IP belirli bir VLAN\'daki istemci ya da sunuculara ulaşamıyor: ping yanıt almıyor, pool üyeleri (varsa) monitor down. Yapılandırmada hata mesajı yok.',
            steps: [
                { code: 'tmsh show net arp', desc: 'Hedefin kaydı "incomplete" ise BIG-IP hedefin MAC adresini öğrenemiyor: sorun L2\'de (arayüz, VLAN üyeliği, etiket ya da switch portu). Kayıt "resolved" ise L2 sağlam; sorun yukarıda (rota, port lockdown, sunucu).' },
                { code: 'tmsh show net interface', desc: 'VLAN\'ın üye arayüzü "up" olmalı. "down" kablo ya da karşı port sorunu, "DS" arayüzün yönetimsel olarak kapatıldığı anlamına gelir.',
                  fix: [{ cause: 'Arayüz yönetimsel olarak kapalı', cmd: 'tmsh modify net interface 1.3 enabled\ntmsh save sys config' }] },
                { code: 'tmsh list net vlan internal', desc: 'Arayüzün modu switch portuyla uyumlu olmalı: trunk port → tagged; access port → untagged. Tagged üyelikte tag, switch\'teki VLAN numarasıyla aynı olmalı. Tag verilmezse BIG-IP 4094\'ten geriye otomatik bir numara seçer.',
                  fix: [{ cause: 'Tag switch ile uyuşmuyor', cmd: 'tmsh modify net vlan internal tag 30\ntmsh save sys config' },
                        { cause: 'Trunk porta bağlı arayüz untagged eklenmiş', cmd: 'tmsh modify net vlan internal interfaces replace-all-with { 1.3 { tagged } }\ntmsh save sys config' }] },
                { code: 'tmsh list net self', desc: 'O ağın self IP\'si doğru VLAN\'a bağlı mı? IP doğru ama vlan satırı farklıysa çerçeveler başka VLAN\'dan gider. Self IP\'nin VLAN\'ı değiştirilecekse silinip doğru VLAN ile yeniden oluşturulur.',
                  fix: [{ cause: 'Self IP yanlış VLAN\'da', cmd: 'tmsh delete net self self_int\ntmsh create net self self_int address 10.64.10.11/24 vlan internal allow-service default\ntmsh save sys config' }] },
                { code: 'tcpdump -nni internal -e host 10.64.10.50', desc: 'bash\'te. -e ile 802.1Q etiketi de görünür. Yalnız giden ARP istekleri görünüp yanıt gelmiyorsa çerçeveler switch\'e ulaşıyor ama doğru VLAN\'a düşmüyordur: switch portunun modunu ve izinli VLAN listesini kontrol edin.' },
            ]
        },
        {
            title: 'GUI (Configuration Utility) ya da SSH\'a Erişilemiyor: httpd/sshd Allow, Port Lockdown ve Yönetim Rotası', severity: 'warn', topic: 'aaa', lab: 'f5-03',
            symptom: 'Bir yönetici BIG-IP GUI\'sine ya da SSH\'a bağlanamıyor; bağlantı reddediliyor ya da zaman aşımına uğruyor. Başka bir ağdan erişim çalışıyor olabilir.',
            steps: [
                { code: 'tmsh list sys httpd allow\ntmsh list sys sshd allow', desc: 'Yöneticinin kaynak adresi (ya da ağı) listede mi? "replace-all-with" ile yapılan bir değişiklik kendi yönetim ağını dışarıda bırakmış olabilir. Liste yönetim IP\'sine ve self IP\'lere gelen yönetim bağlantılarının hepsine uygulanır.',
                  fix: [{ cause: 'Yönetim ağı GUI listesinde yok (konsoldan ya da SSH ile girip ekleyin)', cmd: 'tmsh modify sys httpd allow add { 10.240.0.0/255.255.0.0 }\ntmsh save sys config' },
                        { cause: 'Yönetim ağı SSH listesinde yok (konsoldan girip ekleyin)', cmd: 'tmsh modify sys sshd allow add { 10.240.0.0/255.255.0.0 }\ntmsh save sys config' }] },
                { code: 'tmsh list sys management-ip\ntmsh list sys management-route', desc: 'Yönetici başka bir ağdan geliyorsa dönüş için yönetim rotası gerekir. Yönetim IP\'si değiştirilecekse eskisi silinip yenisi oluşturulur.' },
                { code: 'tmsh list net self allow-service', desc: 'Erişim bir self IP üzerinden deneniyorsa port lockdown da açık olmalı (tcp:443 / tcp:22). Varsayılan none\'dır. İnternete bakan self IP\'de açmak yerine yönetim IP\'sini kullanın.' },
                { code: 'tail -n 50 /var/log/audit', desc: 'Kim, ne zaman, hangi allow komutunu çalıştırdı? tmsh ile yapılan her değişiklik "AUDIT … cmd_data=" satırıyla kaydedilir; son değişikliği bulup geri almak için kullanılır.' },
            ]
        },
        {
            title: 'Yeniden Başlatmadan Sonra Yapılandırma Değişiklikleri Kayboldu (save sys config)', severity: 'warn', topic: 'ops', lab: 'f5-01',
            symptom: 'Bakımda cihaz yeniden başlatıldı; bir gün önce tmsh ile yapılan VLAN, self IP ya da kullanıcı değişiklikleri yok.',
            steps: [
                { code: 'grep "cmd_data" /var/log/audit | tail -n 20', desc: 'Kaybolan değişikliklerin komutlarını audit logundan bulun. tmsh değişiklikleri çalışan yapılandırmaya anında uygulanır ama dosyaya ancak "save sys config" ile yazılır; GUI ise her değişiklikte kaydeder.' },
                { code: 'tmsh load sys config verify', desc: 'Dosyadaki yapılandırmanın hatasız olduğunu yüklemeden doğrular. Değişiklikleri yeniden uyguladıktan sonra kaydetmeden önce kullanılabilir.' },
                { code: 'tmsh save sys config', desc: 'Değişiklikleri yeniden uygulayıp kaydedin. Ağ ayarları /config/bigip_base.conf, trafik nesneleri /config/bigip.conf dosyasına yazılır.',
                  fix: [{ cause: 'Değişiklik yapıldı ama kaydedilmedi', cmd: 'tmsh save sys config' }] },
            ]
        },
    ];
})();
