# Speech-to-Number Conversion Rules

This document lists all the sound-alike conversion rules implemented in the Web Speech API input sanitization system. These rules help convert common misrecognitions and homophones into their intended numerical values.

## Single Digit Numbers (0-9)

### Zero (0)
- `zero` → 0
- `oh` → 0 (common when saying phone numbers)
- `o` → 0 (letter O)
- `hero` → 0 (misheard "zero")

### One (1)
- `one` → 1
- `won` → 1 (homophone)
- `juan` → 1 (name that sounds like "one")
- `wan` → 1 (misheard)
- `i` → 1 (letter I sometimes sounds like "one")

### Two (2)
- `two` → 2
- `to` → 2 (homophone)
- `too` → 2 (homophone)
- `tu` → 2 (shortened form)

### Three (3)
- `three` → 3
- `tree` → 3 (common misrecognition)
- `free` → 3 (rhymes with three)
- `thee` → 3 (old English)
- `see` → 3 (letter C)
- `be` → 3 (sometimes misheard)
- `we` → 3 (sometimes misheard)

### Four (4)
- `four` → 4
- `for` → 4 (homophone)
- `fore` → 4 (homophone)
- `floor` → 4 (contains "four" sound)
- `far` → 4 (misheard)

### Five (5)
- `five` → 5
- `fife` → 5 (similar sound)
- `hive` → 5 (rhymes)

### Six (6)
- `six` → 6
- `sex` → 6 (misheard)
- `sax` → 6 (similar sound)
- `sics` → 6 (verb form)
- `siks` → 6 (phonetic spelling)

### Seven (7)
- `seven` → 7
- `heaven` → 7 (contains "seven" sound)

### Eight (8)
- `eight` → 8
- `ate` → 8 (homophone)
- `hate` → 8 (contains "eight" sound)
- `eat` → 8 (similar sound)
- `a` → 8 (letter A sometimes sounds like "eight")
- `it` → 8 (sometimes misheard as "eight")

### Nine (9)
- `nine` → 9
- `nein` → 9 (German "no")
- `none` → 9 (as requested - "none" → 9)
- `nun` → 9 (similar sound)
- `mine` → 9 (rhymes)

## Teen Numbers (10-19)

### Ten (10)
- `ten` → 10
- `tan` → 10 (similar sound)
- `tin` → 10 (similar sound)
- `pen` → 10 (rhymes)

### Eleven (11)
- `eleven` → 11
- `leaven` → 11 (similar sound)

### Twelve (12)
- `twelve` → 12
- `shelf` → 12 (misheard)

### Thirteen (13)
- `thirteen` → 13
- `hurting` → 13 (contains similar sounds)
- `thirting` → 13 (mispronunciation)

### Fourteen (14)
- `fourteen` → 14
- `forteen` → 14 (common misspelling/pronunciation)
- `fourting` → 14 (mispronunciation)

### Fifteen (15)
- `fifteen` → 15
- `fifting` → 15 (mispronunciation)

### Sixteen (16)
- `sixteen` → 16
- `sixting` → 16 (mispronunciation)

### Seventeen (17)
- `seventeen` → 17
- `seventing` → 17 (mispronunciation)

### Eighteen (18)
- `eighteen` → 18
- `aching` → 18 (misheard)
- `eighting` → 18 (mispronunciation)

### Nineteen (19)
- `nineteen` → 19
- `nineting` → 19 (mispronunciation)

## Tens (20-90)

### Twenty (20)
- `twenty` → 20
- `plenty` → 20 (rhymes)
- `twenny` → 20 (casual pronunciation)

### Thirty (30)
- `thirty` → 30
- `thurty` → 30 (mispronunciation)
- `dirty` → 30 (rhymes)

### Forty (40)
- `forty` → 40
- `fourty` → 40 (common misspelling)

### Fifty (50)
- `fifty` → 50
- `fitty` → 50 (casual pronunciation)

### Sixty (60)
- `sixty` → 60
- `sixdy` → 60 (mispronunciation)

### Seventy (70)
- `seventy` → 70
- `sevendy` → 70 (mispronunciation)

### Eighty (80)
- `eighty` → 80
- `aidy` → 80 (shortened form)

### Ninety (90)
- `ninety` → 90
- `ninedy` → 90 (mispronunciation)

## Implementation Notes

1. **Case Insensitive**: All conversions are performed on lowercase text
2. **Word Boundaries**: Replacements only occur at word boundaries to avoid partial matches
3. **Priority**: Sound-alike replacements are applied before attempting to extract numbers
4. **Logging**: All conversions are logged to help debug recognition issues
5. **Range**: Final numbers are validated to be between 0-999

## Usage Example

If the Web Speech API transcribes "I ate none", the system will:
1. Convert to lowercase: "i ate none"
2. Apply replacements: "1 8 9"
3. Extract the first valid number: 1 (or potentially parse as 189 if needed)

This ensures that even when speech recognition produces homophones or similar-sounding words, the system can still extract the intended numerical value.