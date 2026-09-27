export const SOUND_MAP_INSTRUCTIONS =
  " Use the soundMapClues as a poetic lens for the written word, alongside the line's shape. " +
  "They are the creator's artistic images, not fixed meanings or a scientific account of the sounds. " +
  "Draw on at most one or two supplied images naturally; do not list definitions or interpret unlisted sounds. " +
  "Keep the response an impression of this particular drawing and word.";

export function soundMapClues(word, notes) {
  const small = new Set('ぁぃぅぇぉゃゅょゎ');
  const moras = [];
  for (let char of word) {
    if (char >= 'ァ' && char <= 'ヶ') char = String.fromCharCode(char.charCodeAt(0) - 0x60);
    if (small.has(char) && moras.length) moras[moras.length - 1] += char;
    else if (!'ーっ・'.includes(char)) moras.push(char);
  }
  const matched = [...new Set(moras.filter(mora => typeof notes[mora] === 'string' && notes[mora]))];
  const selected = matched.length > 1 ? [matched[0], matched.at(-1)] : matched;
  return selected.map(kana => ({ kana, image: notes[kana] }));
}
