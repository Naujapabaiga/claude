// Bundled fonts. All are SIL Open Font License 1.1 (free for commercial use)
// and cover the Lithuanian alphabet. Licence texts sit next to the font files.

export interface FontInfo {
  id: string;
  name: string;
  file: string;
}

export const FONTS: FontInfo[] = [
  { id: 'russo-one', name: 'Russo One', file: 'RussoOne-Regular.ttf' },
  { id: 'racing-sans', name: 'Racing Sans One', file: 'RacingSansOne-Regular.ttf' },
  { id: 'anton', name: 'Anton', file: 'Anton-Regular.ttf' },
  { id: 'bebas-neue', name: 'Bebas Neue', file: 'BebasNeue-Regular.ttf' },
  { id: 'saira-condensed', name: 'Saira Condensed ExtraBold', file: 'SairaCondensed-ExtraBold.ttf' },
  { id: 'barlow-condensed', name: 'Barlow Condensed ExtraBold Italic', file: 'BarlowCondensed-ExtraBoldItalic.ttf' },
  { id: 'chakra-petch', name: 'Chakra Petch Bold', file: 'ChakraPetch-Bold.ttf' },
  { id: 'black-ops', name: 'Black Ops One (stencil)', file: 'BlackOpsOne-Regular.ttf' },
];
