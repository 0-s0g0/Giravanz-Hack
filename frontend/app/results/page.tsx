'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

interface AnalysisResult {
  group_id: string;
  group_name: string;
  audio_score: number;
  expression_score: number;
  total_score: number;
  audio_details: {
    avg_volume: number;
    max_volume: number;
    activity_count: number;
  };
  expression_details: {
    avg_score: number;
    max_score: number;
  };
  best_moment_timestamp: number | null;
}

interface SessionResult {
  session_id: string;
  results: AnalysisResult[];
  winner_group_id: string;
  created_at: string;
}

function ResultsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionId = searchParams.get('sessionId');

  const [results, setResults] = useState<SessionResult | null>(null);

  useEffect(() => {
    const resultsStr = localStorage.getItem('sessionResults');
    if (!resultsStr) {
      router.push('/');
      return;
    }

    const data: SessionResult = JSON.parse(resultsStr);
    setResults(data);
  }, [router]);

  const handleRestart = () => {
    localStorage.clear();
    router.push('/');
  };

  if (!results) {
    return (
      <div className="min-h-screen bg-yellow-100 flex items-center justify-center">
        <p className="text-white text-xl">読み込み中...</p>
      </div>
    );
  }

  const winnerGroup = results.results.find(r => r.group_id === results.winner_group_id);

  return (
    <div className="min-h-screen bg-yellow-100 p-4 pb-20">
      <div className="max-w-6xl mx-auto">
        {/* ヘッダー */}
        <div className="bg-white rounded-2xl shadow-2xl p-8 mb-6">
          <h1 className="text-4xl font-bold text-gray-800 mb-4 text-center">
            分析結果
          </h1>
          <p className="text-center text-gray-600">
            セッションID: {results.session_id}
          </p>
        </div>

        {/* 優勝グループ */}
        {winnerGroup && (
          <div className="bg-gradient-to-r from-yellow-400 to-yellow-500 rounded-2xl shadow-2xl p-8 mb-6 text-center transform hover:scale-105 transition">
            <div className="text-6xl mb-4">🏆</div>
            <h2 className="text-3xl font-bold text-white mb-2">
              優勝: {winnerGroup.group_name}
            </h2>
            <p className="text-2xl font-semibold text-white">
              総合スコア: {winnerGroup.total_score}点
            </p>
          </div>
        )}

        {/* 全グループの結果 */}
        <div className="space-y-4">
          {results.results.map((result, index) => {
            const isWinner = result.group_id === results.winner_group_id;
            return (
              <div
                key={result.group_id}
                className={`bg-white rounded-2xl shadow-lg p-6 ${
                  isWinner ? 'ring-4 ring-yellow-400' : ''
                }`}
              >
                <div className="flex items-center gap-4 mb-4">
                  <div className={`flex-shrink-0 w-16 h-16 rounded-full flex items-center justify-center text-white font-bold text-2xl ${
                    isWinner ? 'bg-gradient-to-br from-yellow-400 to-yellow-500' : 'bg-gradient-to-br from-yellow-500 to-red-600'
                  }`}>
                    {index + 1}
                  </div>
                  <div className="flex-1">
                    <h3 className="text-2xl font-bold text-gray-800">
                      {result.group_name}
                      {isWinner && <span className="ml-2 text-yellow-500">👑</span>}
                    </h3>
                    <p className="text-3xl font-bold text-yellow-600 mt-1">
                      {result.total_score}点
                    </p>
                  </div>
                </div>

                {/* 詳細スコア */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* 音声スコア */}
                  <div className="bg-yellow-50 rounded-lg p-4">
                    <h4 className="font-semibold text-gray-700 mb-3 flex items-center gap-2">
                      音声スコア
                    </h4>
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-600">総合:</span>
                        <span className="font-bold text-yellow-600">{result.audio_score}点</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-600">平均音量:</span>
                        <span className="text-sm">{result.audio_details.avg_volume.toFixed(1)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-600">最大音量:</span>
                        <span className="text-sm">{result.audio_details.max_volume.toFixed(1)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-600">発話回数:</span>
                        <span className="text-sm">{result.audio_details.activity_count}回</span>
                      </div>
                    </div>
                  </div>

                  {/* 表情スコア */}
                  <div className="bg-red-50 rounded-lg p-4">
                    <h4 className="font-semibold text-gray-700 mb-3 flex items-center gap-2">
                      表情スコア
                    </h4>
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-600">総合:</span>
                        <span className="font-bold text-red-600">{result.expression_score}点</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-600">平均スコア:</span>
                        <span className="text-sm">{result.expression_details.avg_score.toFixed(1)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-600">最高スコア:</span>
                        <span className="text-sm">{result.expression_details.max_score.toFixed(1)}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* プログレスバー */}
                <div className="mt-4">
                  <div className="flex gap-2 mb-1 text-xs text-gray-600">
                    <span>音声: {result.audio_score}点</span>
                    <span>表情: {result.expression_score}点</span>
                  </div>
                  <div className="h-4 bg-gray-200 rounded-full overflow-hidden flex">
                    <div
                      className="bg-yellow-500"
                      style={{ width: `${(result.audio_score / result.total_score) * 100}%` }}
                    ></div>
                    <div
                      className="bg-red-500"
                      style={{ width: `${(result.expression_score / result.total_score) * 100}%` }}
                    ></div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* アクションボタン */}
        <div className="mt-8 flex gap-4">
          <button
            onClick={handleRestart}
            className="flex-1 bg-white text-yellow-600 font-semibold py-4 px-6 rounded-lg hover:bg-gray-50 transition shadow-lg"
          >
            最初に戻る
          </button>
        </div>

        {/* 説明 */}
        <div className="mt-6 bg-white rounded-lg p-6 shadow-lg">
          <h3 className="font-semibold text-gray-800 mb-3">スコアの見方</h3>
          <ul className="text-sm text-gray-600 space-y-2">
            <li>• <strong>音声スコア (60%)</strong>: 発話の音量と活発さを評価</li>
            <li>• <strong>表情スコア (40%)</strong>: 笑顔や表情の豊かさを評価</li>
            <li>• <strong>総合スコア</strong>: 音声と表情を組み合わせた盛り上がり度</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

export default function ResultsPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <ResultsContent />
    </Suspense>
  );
}
