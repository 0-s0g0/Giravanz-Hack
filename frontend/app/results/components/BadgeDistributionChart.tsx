import Giran1 from '@/public/icon/Giran1.png'
import Giran2 from '@/public/icon/Giran2.png'
import Giran3 from '@/public/icon/Giran3.png'
import Giran4 from '@/public/icon/Giran4.png'
import Mega4 from '@/public/icon/Mega4.png'
import Mega3 from '@/public/icon/Mega3.png'
import Mega2 from '@/public/icon/Mega2.png'
import Mega1 from '@/public/icon/Mega1.png'

interface ScoreDataPoint {
  timestamp: number;
  audioScore: number;
  expressionScore: number;
}

interface BadgeDistributionChartProps {
  scoreHistory: ScoreDataPoint[];
  type: 'audio' | 'expression';
  color: string;
  title: string;
  badgeNames: [string, string, string, string];
}

// バッジ名から画像のマッピング
const badgeImageMap: Record<string, any> = {
  'Giran1': Giran1,
  'Giran2': Giran2,
  'Giran3': Giran3,
  'Giran4': Giran4,
  'Mega1': Mega1,
  'Mega2': Mega2,
  'Mega3': Mega3,
  'Mega4': Mega4,
};

export default function BadgeDistributionChart({
  scoreHistory,
  type,
  color,
  title,
  badgeNames
}: BadgeDistributionChartProps) {
  if (!scoreHistory || scoreHistory.length === 0) {
    return (
      <div className="bg-white rounded-lg p-6 text-center text-gray-500">
        スコア履歴データがありません
      </div>
    );
  }

  // 各バッジ範囲のカウントを計算
  const badges = [
    { name: badgeNames[0], range: '0-25点', count: 0, color: '#ef4444' },
    { name: badgeNames[1], range: '25-50点', count: 0, color: '#f59e0b' },
    { name: badgeNames[2], range: '50-75点', count: 0, color: '#3b82f6' },
    { name: badgeNames[3], range: '75-100点', count: 0, color: '#10b981' }
  ];

  scoreHistory.forEach(d => {
    const score = type === 'audio' ? d.audioScore : d.expressionScore;
    if (score < 25) badges[0].count++;
    else if (score < 50) badges[1].count++;
    else if (score < 75) badges[2].count++;
    else badges[3].count++;
  });

  const maxCount = Math.max(...badges.map(b => b.count), 1);

  // レーダーチャートの設定
  const size = 400;
  const center = size / 2;
  const maxRadius = size / 2 - 80;
  const numPoints = 4;

  // 各頂点の角度を計算（上から時計回り）
  const angles = Array.from({ length: numPoints }, (_, i) =>
    (Math.PI * 2 * i) / numPoints - Math.PI / 2
  );

  // 各頂点の座標を計算
  const getPoint = (index: number, radius: number) => {
    const angle = angles[index];
    return {
      x: center + radius * Math.cos(angle),
      y: center + radius * Math.sin(angle)
    };
  };

  // データポイントのパスを生成
  const dataPoints = badges.map((badge, i) => {
    const radius = (badge.count / maxCount) * maxRadius;
    return getPoint(i, radius);
  });

  const dataPath = dataPoints.map((p, i) =>
    `${i === 0 ? 'M' : 'L'} ${p.x},${p.y}`
  ).join(' ') + ' Z';

  // グリッド線（4段階）
  const gridLevels = [0.25, 0.5, 0.75, 1];

  return (
    <div className="bg-white rounded-lg p-6">
      <h3 className="text-lg font-bold text-gray-800 mb-4">{title}</h3>
      <svg width="100%" height={size} viewBox={`0 0 ${size} ${size}`} className="overflow-visible">
        {/* グリッド線 */}
        {gridLevels.map((level, i) => {
          const gridPoints = Array.from({ length: numPoints }, (_, j) => {
            const radius = maxRadius * level;
            return getPoint(j, radius);
          });
          const gridPath = gridPoints.map((p, j) =>
            `${j === 0 ? 'M' : 'L'} ${p.x},${p.y}`
          ).join(' ') + ' Z';

          return (
            <path
              key={`grid-${i}`}
              d={gridPath}
              fill="none"
              stroke="#e5e7eb"
              strokeWidth="1"
              strokeDasharray={i === gridLevels.length - 1 ? '0' : '4,4'}
            />
          );
        })}

        {/* 軸線 */}
        {badges.map((_, i) => {
          const point = getPoint(i, maxRadius);
          return (
            <line
              key={`axis-${i}`}
              x1={center}
              y1={center}
              x2={point.x}
              y2={point.y}
              stroke="#d1d5db"
              strokeWidth="1"
            />
          );
        })}

        {/* データエリア */}
        <path
          d={dataPath}
          fill={color}
          fillOpacity="0.3"
          stroke={color}
          strokeWidth="3"
          strokeLinejoin="round"
        />

        {/* データポイント */}
        {dataPoints.map((point, i) => (
          <circle
            key={`point-${i}`}
            cx={point.x}
            cy={point.y}
            r="6"
            fill={badges[i].color}
            stroke="white"
            strokeWidth="2"
          />
        ))}

        {/* ラベルとカウント */}
        {badges.map((badge, i) => {
          const labelPoint = getPoint(i, maxRadius + 50);
          const badgeImage = badgeImageMap[badge.name];
          return (
            <g key={`label-${i}`}>
              {/* バッジ画像 */}
              {badgeImage && (
                <image
                  href={badgeImage.src}
                  x={labelPoint.x - 25}
                  y={labelPoint.y - 40}
                  width={50}
                  height={50}
                />
              )}

              <text
                x={labelPoint.x}
                y={labelPoint.y + 35}
                textAnchor="middle"
                className="text-lg fill-gray-800 font-bold"
              >
                {badge.count}回
              </text>
            </g>
          );
        })}

        {/* 中央の最大値ラベル */}
        <text
          x={center}
          y={center - 5}
          textAnchor="middle"
          className="text-xs fill-gray-400"
        >
          最大: {maxCount}回
        </text>
      </svg>

      {/* バッジ凡例 */}
      <div className="mt-6 border-t pt-4">
        <h4 className="text-sm font-semibold text-gray-700 mb-3 text-center">バッジ一覧</h4>
        <div className="grid grid-cols-4 gap-4">
          {badges.map((badge, i) => {
            const badgeImage = badgeImageMap[badge.name];
            return (
              <div key={`legend-${i}`} className="flex flex-col items-center">
                {badgeImage && (
                  <img
                    src={badgeImage.src}
                    alt={badge.name}
                    className="w-16 h-16 object-contain mb-2"
                  />
                )}
                <p className="text-xs font-semibold text-gray-700">{badge.name}</p>
                <p className="text-xs text-gray-500">{badge.range}</p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
