interface ScoreDataPoint {
  timestamp: number;
  audioScore: number;
  expressionScore: number;
}

interface ScoreTimelineChartProps {
  scoreHistory: ScoreDataPoint[];
  type: 'audio' | 'expression';
  color: string;
  title: string;
}

export default function ScoreTimelineChart({ scoreHistory, type, color, title }: ScoreTimelineChartProps) {
  if (!scoreHistory || scoreHistory.length === 0) {
    return (
      <div className="bg-white rounded-lg p-6 text-center text-gray-500">
        スコア履歴データがありません
      </div>
    );
  }

  const width = 800;
  const height = 300;
  const padding = { top: 20, right: 30, bottom: 40, left: 50 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  // データの最大値と最小値を取得
  const maxTimestamp = Math.max(...scoreHistory.map(d => d.timestamp));
  const minTimestamp = Math.min(...scoreHistory.map(d => d.timestamp));
  const maxScore = 100;
  const minScore = 0;

  // スケール変換関数
  const xScale = (timestamp: number) =>
    padding.left + ((timestamp - minTimestamp) / (maxTimestamp - minTimestamp || 1)) * chartWidth;

  const yScale = (score: number) =>
    padding.top + chartHeight - ((score - minScore) / (maxScore - minScore)) * chartHeight;

  // 折れ線グラフのパスを生成
  const linePoints = scoreHistory.map(d => {
    const score = type === 'audio' ? d.audioScore : d.expressionScore;
    return `${xScale(d.timestamp)},${yScale(score)}`;
  }).join(' L ');

  const linePath = `M ${linePoints}`;

  // 塗りつぶしエリアのパスを生成
  const areaPath = `M ${padding.left},${yScale(0)} L ${linePoints} L ${xScale(maxTimestamp)},${yScale(0)} Z`;

  // X軸のラベル（時間）
  const xAxisLabels = Array.from({ length: 6 }, (_, i) => {
    const time = (maxTimestamp / 5) * i / 1000; // ミリ秒を秒に変換
    return {
      x: xScale(minTimestamp + (maxTimestamp - minTimestamp) * (i / 5)),
      label: `${Math.floor(time)}s`
    };
  });

  // Y軸のラベル（点数）
  const yAxisLabels = Array.from({ length: 6 }, (_, i) => {
    const score = (maxScore / 5) * i;
    return {
      y: yScale(score),
      label: `${Math.floor(score)}`
    };
  });

  return (
    <div className="bg-white rounded-lg p-6">
      <h3 className="text-lg font-bold text-gray-800 mb-4">{title}</h3>
      <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
        {/* グリッド線 */}
        {yAxisLabels.map((label, i) => (
          <line
            key={`grid-y-${i}`}
            x1={padding.left}
            y1={label.y}
            x2={width - padding.right}
            y2={label.y}
            stroke="#e5e7eb"
            strokeWidth="1"
          />
        ))}

        {xAxisLabels.map((label, i) => (
          <line
            key={`grid-x-${i}`}
            x1={label.x}
            y1={padding.top}
            x2={label.x}
            y2={height - padding.bottom}
            stroke="#e5e7eb"
            strokeWidth="1"
          />
        ))}

        {/* エリア塗りつぶし */}
        <path
          d={areaPath}
          fill={color}
          fillOpacity="0.2"
        />

        {/* 折れ線 */}
        <path
          d={linePath}
          fill="none"
          stroke={color}
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* データポイント */}
        {scoreHistory.map((d, i) => {
          const score = type === 'audio' ? d.audioScore : d.expressionScore;
          return (
            <circle
              key={i}
              cx={xScale(d.timestamp)}
              cy={yScale(score)}
              r="4"
              fill={color}
              stroke="white"
              strokeWidth="2"
            />
          );
        })}

        {/* X軸 */}
        <line
          x1={padding.left}
          y1={height - padding.bottom}
          x2={width - padding.right}
          y2={height - padding.bottom}
          stroke="#374151"
          strokeWidth="2"
        />

        {/* Y軸 */}
        <line
          x1={padding.left}
          y1={padding.top}
          x2={padding.left}
          y2={height - padding.bottom}
          stroke="#374151"
          strokeWidth="2"
        />

        {/* X軸ラベル */}
        {xAxisLabels.map((label, i) => (
          <text
            key={`label-x-${i}`}
            x={label.x}
            y={height - padding.bottom + 20}
            textAnchor="middle"
            className="text-xs fill-gray-600"
          >
            {label.label}
          </text>
        ))}

        {/* Y軸ラベル */}
        {yAxisLabels.map((label, i) => (
          <text
            key={`label-y-${i}`}
            x={padding.left - 10}
            y={label.y + 4}
            textAnchor="end"
            className="text-lg fill-gray-600"
          >
            {label.label}
          </text>
        ))}

        {/* X軸タイトル */}
        <text
          x={width / 2}
          y={height - 5}
          textAnchor="middle"
          className="text-sm fill-gray-700 font-semibold"
        >
          時間 (秒)
        </text>



      </svg>
    </div>
  );
}
