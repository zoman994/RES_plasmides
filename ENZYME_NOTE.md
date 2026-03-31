# КРИТИЧНО: Разделение ферментов по типу junction

Прочитай это ПЕРЕД выполнением CURRENT_TASK.md.

## Golden Gate → ТОЛЬКО Type IIS

Golden Gate работает ТОЛЬКО с Type IIS рестриктазами (режут ВНЕ сайта узнавания).

В JunctionBlock popup для `golden_gate` — ТОЛЬКО `GG_ENZYMES` из `golden-gate.js`:
- BsaI (Eco31I), BpiI (BbsI), BsmBI (Esp3I), BtgZI, SapI
- Это уже реализовано — НЕ ломать при создании restriction-db.js

## RE / Лигирование → ТОЛЬКО классические RE

В JunctionBlock popup для `re_ligation` — ТОЛЬКО `RE_ENZYMES` из НОВОГО `restriction-db.js`:
- 27 классических: EcoRI, BamHI, HindIII, XbaI, XhoI, SalI, NcoI, NdeI, PstI, SphI, KpnI, SacI, NheI, BglII, ClaI, MfeI, AgeI, SpeI, AvrII, BclI, NotI, AscI, FseI, PacI, EcoRV, SmaI, StuI
- НЕ включать Type IIS (BsaI, BpiI...) — они принадлежат Golden Gate

## Два словаря, два файла:

| Словарь | Файл | Ферменты | Popup |
|---------|------|----------|-------|
| `GG_ENZYMES` | `golden-gate.js` (существует) | 5 Type IIS | Golden Gate junction |
| `RE_ENZYMES` | `restriction-db.js` (НОВЫЙ) | 27 классических | RE/Лигирование junction |

**НЕ СМЕШИВАТЬ.** Type IIS ≠ классические RE. Разные механизмы, разные popup-ы.
