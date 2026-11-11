# Critical Rolls for Foundry VTT

## English

Critical Rolls brings the natural 1 and 20 tables from the Critical Rolls book (Nord Games) into Foundry VTT for D&D 5e. When a natural 1 or 20 is rolled, the module posts a card, rolls the matching table and applies its effects, automatically or after the GM's decision.

### Features

- Detects natural 1s and 20s on d20 rolls: attacks, ability and skill checks, saving throws and tools. Initiative, death saves and free rolls can be included in the settings.
- Posts a card with who rolled, what was rolled, the targets, the dice and the total.
- Rolls the table: a d10 and a d6 pick one of 60 entries. Attacks use the attack type (melee, ranged, natural, magic); damage uses the damage type (slashing, piercing, bludgeoning, magical). Each entry has a severity tier that opens with character level.
- Applies the effects: conditions, numeric modifiers, damage and healing, temporary hit points, extra critical damage (doubled, tripled or maximum), advantage and disadvantage, half or minimum damage from the next attack, and effects at the start or end of a turn.
- Effects are applied automatically or after a button press. The GM can accept, decline or reroll the result, and players can take part in the decision if the GM allows it.
- Luck and fumble results become one-use items on the character sheet. The player chooses a variant or keeps both.
- Plays a sound and highlights the token on 1 and 20. Both can be turned off.
- Lets the GM set an effect by hand without a real 1 or 20: type `/cr` in the chat or use the token controls button.
- Creates a Critical Rolls folder with the tables in the Tables sidebar.

### What happens on a roll

| Roll | Section | Result |
|---|---|---|
| Natural 1 on an attack | Critical miss | an effect by attack type (melee, ranged, natural, magic) |
| Natural 20 on an enemy's attack | Critical hit for the GM | an effect by damage type, applied to the hero |
| Natural 20 on a player's or ally's attack | Critical hit for players | an effect by damage type, applied to the target |
| Natural 1 on a player's d20 | Fumble effect | a "Fumble" item |
| Natural 20 on a player's d20 | Luck effect | a "Luck" item |

On a player's attack, a natural 1 triggers both the critical miss and the fumble effect. Which roll types give luck and fumble effects is set in the settings.

### Requirements

- Foundry VTT 14
- dnd5e system 5.3.0 or later
- No other modules are required. Dice So Nice works as usual if it is installed.

### Installation

**By manifest URL.** In Foundry, open Add-on Modules → Install Module and paste the manifest URL:

```
https://raw.githubusercontent.com/Depressa/critical-rolls/main/critical-rolls/module.json
```

**From a release.** Download `critical-rolls.zip` from the Releases page and unzip it into the `Data/modules` folder of your Foundry data. The archive already contains the `critical-rolls` folder.

After installing or updating the module, restart Foundry completely. Reloading the world is not enough. Then enable the module in Manage Modules.

### Settings

All settings are in Settings → Configure Settings → Module Settings → Critical Rolls. Only the GM can change them.

- **Sections:** off, confirm or automatic for each section (critical misses, critical hits for the GM, critical hits for players, fumble, luck).
- **Who decides:** whether players take part in the decision, whether the decision window opens, whether effects apply automatically, and who sees the cards.
- **Rules:** which natural values count as 20, which count as 1, how often a critical miss effect applies (once per combat, once per round or every time), the level cap for tables, and what happens when a character already has a luck or fumble item.
- **Which rolls give luck and fumble:** attacks, checks and saving throws are on by default; death saves, initiative and free rolls are off. The group appears when the luck or fumble section is on.
- **Sound and highlight.**
- **Tables** in the Tables sidebar.

A full reference with default values is in [SETTINGS.md](SETTINGS.md).

### Commands and buttons

- `/cr` in the chat opens the manual effect window (GM only).
- The dice button in the token controls does the same.

### Limitations

- Foundry rolls dice on the player's client, so a roll cannot be protected from tampering. Free rolls such as `/r 1d20` are not counted by default.
- The damage of a critical hit is matched to the attack by a shared usage identifier. If the damage was rolled in some other way, and many other rolls came in between, the damage multiplier may have to be applied by hand.
- If no target is selected, effects aimed at "the target" are not applied automatically. Select the token and press the button on the card.
- Only dnd5e 5.3 is supported.

### Languages

The interface and the table texts are available in English and Russian. The language follows Foundry's language setting.

### License

The table texts come from the book *Game Master's Toolbox: Critical Rolls* by Chris Haskins, Nord Games LLC (2016). The book is published as Open Game Content under the OGL 1.0a license (see page 48 of the book). "Nord Games", "Game Master's Toolbox" and "Critical Rolls" are not used as trademarks in this module.

## Русский

Critical Rolls переносит в Foundry VTT таблицы натуральных 1 и 20 из книги «Критические броски» (Nord Games) для D&D 5e. Когда выпадает натуральная 1 или 20, модуль публикует карточку, бросает нужную таблицу и применяет её эффекты: автоматически или после решения Мастера.

### Возможности

- Отслеживает натуральные 1 и 20 на d20: броски атаки, проверки характеристик и навыков, спасброски и инструменты. Инициативу, спасброски от смерти и свободные броски можно включить в настройках.
- Публикует карточку: кто бросил, что выпало, цели, кубики и итог.
- Бросает таблицу: d10 и d6 выбирают одну из 60 записей. Для атак берётся вид атаки (рукопашная, дальнобойная, природная, магия), для урона тип урона (рубящий, колющий, дробящий, магический). У каждой записи есть уровень риска, который открывается с уровнем персонажа.
- Применяет эффекты: состояния, числовые модификаторы, урон и лечение, временные хиты, дополнительный урон при критическом попадании (двойной, тройной, максимальный), преимущество и помеху, половину или минимум урона от следующей атаки, эффекты в начале и конце хода.
- Эффекты применяются автоматически или после нажатия кнопки. Мастер может принять, отказаться или перебросить результат; игрок может участвовать в решении, если Мастер это разрешил.
- Результаты удачи и неудачи становятся одноразовыми предметами на листе персонажа. Игрок выбирает вариант или оставляет оба.
- На 1 и 20 проигрывает звук и подсвечивает токен. Оба можно отключить.
- Позволяет Мастеру задать эффект вручную без настоящей 1 или 20: команда `/cr` в чате или кнопка в инструментах токенов.
- Создаёт в боковой панели «Таблицы» папку Critical Rolls с таблицами.

### Что происходит при броске

| Что выпало | Раздел | Результат |
|---|---|---|
| Натуральная 1 на атаке | Критический промах | эффект по виду атаки (рукопашная, дальнобойная, природная, магия) |
| Натуральная 20 на атаке противника | Критическое попадание для Мастера | эффект по типу урона, действует на героя |
| Натуральная 20 на атаке игрока или союзника | Критическое попадание для игроков | эффект по типу урона, действует на цель |
| Натуральная 1 на d20 игрока | Эффект неудачи | предмет «Неудача» |
| Натуральная 20 на d20 игрока | Эффект удачи | предмет «Удача» |

На атаке игрока натуральная 1 срабатывает и как промах, и как неудача. Какие виды бросков дают удачу и неудачу, задаётся в настройках.

### Требования

- Foundry VTT 14
- Система dnd5e 5.3.0 или новее
- Других модулей не нужно. Dice So Nice работает как обычно, если установлен.

### Установка

**По ссылке на манифест.** В Foundry откройте Add-on Modules → Install Module и вставьте ссылку на манифест:

```
https://raw.githubusercontent.com/Depressa/critical-rolls/main/critical-rolls/module.json
```

**Из релиза.** Скачайте `critical-rolls.zip` со страницы Releases и распакуйте в папку `Data/modules` вашей установки Foundry. В архиве уже есть папка `critical-rolls`.

После установки или обновления модуля полностью перезапустите Foundry: перезагрузки мира недостаточно. Затем включите модуль в Manage Modules.

### Настройки

Все настройки лежат в Settings → Configure Settings → Module Settings → Critical Rolls. Менять их может только Мастер.

- **Разделы:** выключен, подтверждение или авто для каждого раздела (критические промахи, попадания для Мастера, попадания для игроков, неудача, удача).
- **Кто решает:** участвуют ли игроки в решении, открывается ли окно решения, применяются ли эффекты автоматически и кто видит карточки.
- **Правила:** какие значения считаются 20, какие считаются 1, как часто применяется эффект критического промаха (раз за бой, раз за раунд или каждый раз), ограничение таблиц по уровню героев и что делать, если у персонажа уже есть предмет удачи или неудачи.
- **На какие броски применять удачу и неудачу:** атаки, проверки и спасброски включены по умолчанию, спасброски от смерти, инициатива и свободные броски выключены. Группа видна, когда включён раздел удачи или неудачи.
- **Звук и подсветка.**
- **Таблицы** в боковой панели.

Полный справочник со значениями по умолчанию: [SETTINGS.md](SETTINGS.md).

### Команды и кнопки

- `/cr` в чате открывает окно ручного эффекта (только для Мастера).
- Кнопка с кубиком в инструментах токенов делает то же самое.

### Ограничения

- Foundry бросает кубики на клиенте игрока, поэтому защититься от подделки броска нельзя. Свободные броски вроде `/r 1d20` по умолчанию не учитываются.
- Урон критического попадания сопоставляется с атакой по общему идентификатору использования. Если урон брошен иначе и между атакой и уроном было много других бросков, множитель урона придётся применить вручную.
- Если цель не выбрана, эффекты «на цель» сами не применяются. Выделите токен и нажмите кнопку на карточке.
- Поддерживается только dnd5e 5.3.

### Языки

Интерфейс и тексты таблиц есть на английском и русском. Язык выбирается настройками Foundry.

### Лицензия

Тексты таблиц взяты из книги *Game Master's Toolbox: Critical Rolls* (Chris Haskins, Nord Games LLC, 2016). Книга выпущена как Open Game Content по лицензии OGL 1.0a (см. стр. 48 книги). Названия «Nord Games», «Game Master's Toolbox» и «Critical Rolls» в модуле не используются как товарные знаки.
