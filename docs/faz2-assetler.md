# Faz 2 – Poly Haven aday listesi (Görev 2.1)

Odaya girecek model ve dokular için adaylar. Hepsi **[Poly Haven](https://polyhaven.com)**, lisans **CC0**. Henüz hiçbir şey indirilmedi.
Liste `https://api.polyhaven.com/assets?t=models` ve `?t=textures` adreslerinden (User-Agent: `Defter`) alındı; her link tek tek kontrol edildi.

- **Üçgen (polycount):** API'nin `polycount` alanı. Dokular için yok.
- **Boyut:** API'nin `dimensions` alanı, santimetre (genişlik × derinlik × yükseklik).
- Kitaplık için model aranmadı; kitaplık kendi kodumuz olarak kalıyor.

## Çalışma masası ve sandalye

**Poly Haven'da istenen stilde aday bulunamadı.** Uydurma ya da zorlama aday konmadı.

İstenen stil: sıcak, modern-minimal, İskandinav; açık renk ahşap (meşe, dişbudak, huş), sade çizgiler, ince bacaklar. Masa: gerçek çalışma masası, en az 120 cm genişlik, ~75 cm yükseklik, düz ve boş üst. Sandalye: çalışma masasına uygun, modern; yemek sandalyesi ya da büyük koltuk değil.

Nasıl arandı: tüm 521 modelde (sadece "furniture" değil) isim ve etiketlerde *table, desk, chair, stool, seat* geçenler; üçgen sayısı 50 binin altında; eski listedeki 6 aday hariç.

**Masa (37 model tarandı).** Genişliği ≥120 cm ve yüksekliği 70–80 cm olanlar stile uymuyor:

| Model | Boyut (cm) | Neden elendi |
|---|---|---|
| [Metal Office Desk](https://polyhaven.com/a/metal_office_desk) | 200 × 95 × 79 | Koyu gri, eski, metal ofis masası |
| [Painted Wooden Table](https://polyhaven.com/a/painted_wooden_table) | 241 × 114 × 96 | Eski, boyalı çiftlik masası |
| [Dining Table](https://polyhaven.com/a/dining_table) | 226 × 139 × 88 | Örtülü yemek masası |
| [Wooden Picnic Table](https://polyhaven.com/a/wooden_picnic_table) | 224 × 302 × 75 | Piknik masası |

Modern ve açık renk olanlar çalışma masası değil: [Modern Coffee Table 01](https://polyhaven.com/a/modern_coffee_table_01) ve [02](https://polyhaven.com/a/modern_coffee_table_02) sehpa (~38 cm yükseklik); [Side Table 01](https://polyhaven.com/a/side_table_01) sade meşe yan masa ama 55 × 45 × 55 cm.

**Sandalye (35 model tarandı).** Ahşap olanların hepsi antika, gotik, Çin işi ya da boyalı çiftlik sandalyesi. Modern olanlar: lacivert plastik okul sandalyesi ([School Chair 01](https://polyhaven.com/a/SchoolChair_01)), metal tabureler, büyük deri koltuk ([Mid Century Lounge Chair](https://polyhaven.com/a/mid_century_lounge_chair)) ve puf. Açık renk ahşap, modern bir çalışma sandalyesi yok.

**Karar (Deniz):** Masa ve sandalye Blender'da kendimiz modellenecek (`build_room.py`): sade İskandinav masa (düz üst tabla, ince bacaklar) ve sandalye. Üzerlerine Poly Haven'dan açık renk ahşap ve kumaş dokuları (CC0) giydirilecek; dokular ayrıca seçilecek.

**Masa ve sandalye özellikleri (Görev 2.2'de `build_room.py`):**
- Ölçüler gerçek ölçü; odaya konurken 1,9467 ile büyütülür.
- Tüm kenarlarda küçük pah (bevel), gerçek ölçüde 3–5 mm.
- Masa: açık meşe tabla, yaklaşık 140 × 70 cm, 2,5 cm kalınlık; hafif içe eğimli ince yuvarlak bacaklar; tablanın altında ince bir çerçeve; üstü boş.
- Sandalye: açık meşe iskelet, hafif kavisli sırt, oturakta açık gri kumaş minder.
- Ahşap damarı tablanın uzun kenarı boyunca.

**Seçilen dokular (CC0):**

| | İsim | Link | Kullanım | Not |
|---|---|---|---|---|
| ![Oak Veneer 05](https://cdn.polyhaven.com/asset_img/thumbs/oak_veneer_05.png?width=128&height=128) | Oak Veneer 05 | [polyhaven.com/a/oak_veneer_05](https://polyhaven.com/a/oak_veneer_05) | Masa ve sandalye ahşabı | Açık, sıcak meşe; ince, düzgün damar. Yedek: [Ash Veneer](https://polyhaven.com/a/ash_veneer). |
| ![Jogging Melange](https://cdn.polyhaven.com/asset_img/thumbs/jogging_melange.png?width=128&height=128) | Jogging Melange | [polyhaven.com/a/jogging_melange](https://polyhaven.com/a/jogging_melange) | Sandalye minderi | Açık gri melanj kumaş. |

## Saksı bitkisi

| | İsim | Link | Üçgen | Boyut (cm) | Not |
|---|---|---|---|---|---|
| ![Potted Plant 01](https://cdn.polyhaven.com/asset_img/thumbs/potted_plant_01.png?width=128&height=128) | Potted Plant 01 | [polyhaven.com/a/potted_plant_01](https://polyhaven.com/a/potted_plant_01) | 96.030 | 59 × 64 × 135 | Büyük, terrakota saksı. Üçgen sayısı yüksek. |
| ![Potted Plant 02](https://cdn.polyhaven.com/asset_img/thumbs/potted_plant_02.png?width=128&height=128) | Potted Plant 02 | [polyhaven.com/a/potted_plant_02](https://polyhaven.com/a/potted_plant_02) | 69.806 | 70 × 66 × 84 | Orta boy. Üçgen sayısı yüksek. |
| ![Potted Plant 04](https://cdn.polyhaven.com/asset_img/thumbs/potted_plant_04.png?width=128&height=128) | Potted Plant 04 | [polyhaven.com/a/potted_plant_04](https://polyhaven.com/a/potted_plant_04) | 6.097 | 17 × 19 × 27 | Küçük sukulent; raf veya masa üstü için. |

## Masa lambası

| | İsim | Link | Üçgen | Boyut (cm) | Not |
|---|---|---|---|---|---|
| ![Desk Lamp Arm 01](https://cdn.polyhaven.com/asset_img/thumbs/desk_lamp_arm_01.png?width=128&height=128) | Desk Lamp Arm 01 | [polyhaven.com/a/desk_lamp_arm_01](https://polyhaven.com/a/desk_lamp_arm_01) | 25.710 | 62 × 41 × 88 | Gerçek bir masa lambası (endüstriyel, kollu). |
| ![Industrial Pipe Lamp](https://cdn.polyhaven.com/asset_img/thumbs/industrial_pipe_lamp.png?width=128&height=128) | Industrial Pipe Lamp | [polyhaven.com/a/industrial_pipe_lamp](https://polyhaven.com/a/industrial_pipe_lamp) | 8.626 | 18 × 26 × 36 | Boru gövdeli küçük masa lambası. |
| ![Vintage Oil Lamp](https://cdn.polyhaven.com/asset_img/thumbs/vintage_oil_lamp.png?width=128&height=128) | Vintage Oil Lamp | [polyhaven.com/a/vintage_oil_lamp](https://polyhaven.com/a/vintage_oil_lamp) | 7.208 | 22 × 22 × 80 | Sıcak, eski usul gaz lambası. |

## Halı (doku)

| | İsim | Link | Üçgen | Boyut (cm) | Not |
|---|---|---|---|---|---|
| ![Wool Boucle](https://cdn.polyhaven.com/asset_img/thumbs/wool_boucle.png?width=128&height=128) | Wool Boucle | [polyhaven.com/a/wool_boucle](https://polyhaven.com/a/wool_boucle) | – | doku | Krem yün dokuma. |
| ![Terlenka](https://cdn.polyhaven.com/asset_img/thumbs/terlenka.png?width=128&height=128) | Terlenka | [polyhaven.com/a/terlenka](https://polyhaven.com/a/terlenka) | – | doku | Bej, ince dokuma. |
| ![Hessian 380](https://cdn.polyhaven.com/asset_img/thumbs/hessian_380.png?width=128&height=128) | Hessian 380 | [polyhaven.com/a/hessian_380](https://polyhaven.com/a/hessian_380) | – | doku | Jüt/hasır görünümü. |

## Küçük objeler

| | İsim | Link | Üçgen | Boyut (cm) | Not |
|---|---|---|---|---|---|
| ![Stationery Supplies](https://cdn.polyhaven.com/asset_img/thumbs/stationery_supplies.png?width=128&height=128) | Stationery Supplies | [polyhaven.com/a/stationery_supplies](https://polyhaven.com/a/stationery_supplies) | 4.412 | 30 × 8 × 16 | Kalem, kurşun kalem, silgi. |
| ![Office Notepads](https://cdn.polyhaven.com/asset_img/thumbs/office_notepads.png?width=128&height=128) | Office Notepads | [polyhaven.com/a/office_notepads](https://polyhaven.com/a/office_notepads) | 666 | 110 × 66 × 2 | Bloknot / not defterleri. |
| ![Alarm Clock 01](https://cdn.polyhaven.com/asset_img/thumbs/alarm_clock_01.png?width=128&height=128) | Alarm Clock 01 | [polyhaven.com/a/alarm_clock_01](https://polyhaven.com/a/alarm_clock_01) | 13.006 | 23 × 17 × 17 | Eski çalar saat. |

## Ahşap zemin (doku)

| | İsim | Link | Üçgen | Boyut (cm) | Not |
|---|---|---|---|---|---|
| ![Wood Floor](https://cdn.polyhaven.com/asset_img/thumbs/wood_floor.png?width=128&height=128) | Wood Floor | [polyhaven.com/a/wood_floor](https://polyhaven.com/a/wood_floor) | – | doku | Temiz ahşap parke. |
| ![Plank Flooring 04](https://cdn.polyhaven.com/asset_img/thumbs/plank_flooring_04.png?width=128&height=128) | Plank Flooring 04 | [polyhaven.com/a/plank_flooring_04](https://polyhaven.com/a/plank_flooring_04) | – | doku | Vernikli tahta döşeme. |
| ![Laminate Floor 02](https://cdn.polyhaven.com/asset_img/thumbs/laminate_floor_02.png?width=128&height=128) | Laminate Floor 02 | [polyhaven.com/a/laminate_floor_02](https://polyhaven.com/a/laminate_floor_02) | – | doku | Düz, açık renk laminat. |

## Sıva / boya duvar (doku)

| | İsim | Link | Üçgen | Boyut (cm) | Not |
|---|---|---|---|---|---|
| ![White Plaster 02](https://cdn.polyhaven.com/asset_img/thumbs/white_plaster_02.png?width=128&height=128) | White Plaster 02 | [polyhaven.com/a/white_plaster_02](https://polyhaven.com/a/white_plaster_02) | – | doku | Düz beyaz sıva; oda.duvar rengiyle boyanmaya en uygun. |
| ![Beige Wall 001](https://cdn.polyhaven.com/asset_img/thumbs/beige_wall_001.png?width=128&height=128) | Beige Wall 001 | [polyhaven.com/a/beige_wall_001](https://polyhaven.com/a/beige_wall_001) | – | doku | Bej boyalı, pürüzsüz duvar. |
| ![Beige Wall 002](https://cdn.polyhaven.com/asset_img/thumbs/beige_wall_002.png?width=128&height=128) | Beige Wall 002 | [polyhaven.com/a/beige_wall_002](https://polyhaven.com/a/beige_wall_002) | – | doku | Bej boyalı, hafif dokulu duvar. |

## Notlar

- **Halı:** Poly Haven'da halı modeli yok. Adaylar kumaş dokuları; bunları odadaki mevcut yuvarlak halının üstüne uygularız.
- **Kupa:** Tek başına kupa modeli yok. En yakını `tea_set_01` (Tea Set 01, 40.296 üçgen, fincanlı çay seti). Mevcut kupa kodla kalabilir.
- **Üçgen bütçesi:** Toplam en fazla 300 bin. `potted_plant_01` + `potted_plant_02` tek başına yaklaşık 166 bin; ikisini birden seçersek diğerlerine az yer kalır.
- **Ölçek (önemli):** Mevcut oda gerçek ölçünün yaklaşık **2 katı**. Odadaki masa 1,46 m yüksekliğinde ve oda 10 × 8 × 6 m; gerçek bir masa ise ~0,75 m. CLAUDE.md "1 Blender birimi = 1 metre, three.js ölçüleriyle birebir" diyor. Gerçek ölçülü modeller bu odada yarı boyda görünür. **Karar:** Oda olduğu gibi kalır; Poly Haven modelleri Blender'da **1,9467** ile büyütülür (odadaki masa yüksekliği 146 cm ÷ gerçek masa 75 cm).

## Seçimin

Her kategoriden birini yaz (ya da bana söyle):

- Çalışma masası: Blender'da kendimiz modelleyeceğiz
- Sandalye: Blender'da kendimiz modelleyeceğiz
- Saksı bitkisi: 
- Masa lambası: 
- Halı (doku): 
- Küçük objeler: 
- Ahşap zemin (doku): 
- Sıva / boya duvar (doku): 
