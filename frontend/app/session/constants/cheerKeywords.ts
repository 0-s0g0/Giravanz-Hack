import logo from '@/public/emblem_nonBG.png'
import kaba from '@/public/kaba.jpg'
import nagai from '@/public/nagai.jpg'
import sunzin from '@/public/sunzin.jpg'
import iine from '@/public/iine.png' 
import fight from '@/public/running.png'
import nice from '@/public/nice.png'
import gira from '@/public/fanny.png'

// 検出する応援キーワードリスト
export const CHEER_KEYWORDS = [
  'がんばれ', '頑張れ', 'ガンバレ','がん','ガン',
  'いいね', 'イイネ','いね','イネ',
  'やったー', 'ヤッター',
  'ファイ', 'ふぁい',
  'ゴール',
  'ギラヴァンツ', 'ぎら','ギラ',
  'ボール',
  'すごい', 'スゴイ',
  'ナイス',  'ないす', 'ナイ',
  'よし', 'ヨシ',
  'いけ', 'イケ',
  'すんじん', 'スンジン','新人',
  'かば','カバ',
  'ながい','ナガイ','長い','長井','永井'
];

// 画像とキーワードのグループ定義
const keywordGroups = [
  {
    image: logo.src,
    keywords: ['ギラヴァンツ', 'ぎらヴぁんツ', 'ギラ']
  },
  {
    image: iine.src,
    keywords: ['いいね', 'イイネ','いね','イネ']
  },
    {
    image: fight.src,
    keywords: ['ファイ', 'ふぁい',]
  },
    {
    image: nice.src,
    keywords: [ 'ナイス',  'ないす', 'ナイ']
  },
  {
    image: sunzin.src,
    keywords: ['すんじん', '新人', 'スンジン']
  },
  {
    image: kaba.src,
    keywords: ['かば', 'カバ']
  },
  {
    image: nagai.src,
    keywords: ['ながい', 'ナガイ', '長井', '永井', '長い']
  },
];

// キーワードから画像へのマッピングを生成
export const KEYWORD_IMAGE_MAP: Record<string, any> = keywordGroups.reduce((acc, group) => {
  group.keywords.forEach(keyword => {
    acc[keyword] = group.image;
  });
  return acc;
}, {} as Record<string, any>);
