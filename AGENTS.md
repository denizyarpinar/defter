# AGENTS.md

Önce oku: `CLAUDE.md` (kurallar) ve `docs/DURUM.md` (durum, sıradaki adım).
Kurallar CLAUDE.md'dedir; burada tekrar edilmez. Çelişki olursa CLAUDE.md geçerlidir.

## Her görevde
1. `git status` temiz mi bak; değilse dur ve Deniz'e sor. Sonra `git pull`.
2. Önce plan göster, commit atma. Deniz onaylayınca uygula.
3. `.env*` dosyaları ve secret'lar asla yazılmaz, gösterilmez, istenmez.
4. main'e birleştirme sadece Deniz'in onayıyla.
5. Alınmış kararları (CLAUDE.md, docs/DURUM.md) onaysız değiştirme.
6. Deneme adreslerini her zaman tam yaz (dar `?kapsam=dar&sahip=0&kurulum=1&olcum=1`, sahip `?kurulum=1&olcum=1`).
7. Görev sonunda `docs/DURUM.md`'yi güncelle (durum + "Son güncelleyen" satırı).
8. Oturum ya da limit bitmek üzereyse işi yarıda bırakmadan önce docs/DURUM.md'ye 'Yarım kalan iş' bölümü yaz (ne yapıldı, ne kaldı, hangi dosyalar değişti, sonraki adım). Sonraki oturum önce bu bölümü okur.

Dil: Deniz ile Türkçe (bkz. CLAUDE.md → "Deniz ile çalışma kuralları").
