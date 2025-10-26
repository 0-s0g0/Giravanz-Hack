'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Image from 'next/image';
import CirclesBackground from '@/app/background/cycle-background'
import Giran1 from '@/public/icon/Giran1.png'
import Giran2 from '@/public/icon/Giran2.png'
import Giran3 from '@/public/icon/Giran3.png'
import Giran4 from '@/public/icon/Giran4.png'
import Mega4 from '@/public/icon/Mega4.png'
import Mega3 from '@/public/icon/Mega3.png'
import Mega2 from '@/public/icon/Mega2.png'
import Mega1 from '@/public/icon/Mega1.png'
import ScoreTimelineChart from './components/ScoreTimelineChart'
import BadgeDistributionChart from './components/BadgeDistributionChart'
import {Accordion} from './components/Acordion'

interface AnalysisResult {
  group_id: string;
  group_name: string;
  audio_score: number;
  expression_score: number;
  total_score: number;
  audio_details: {
    avg_score: number;
    max_score: number;
    avg_db: number;
    avg_high_freq_percentage: number;
    sample_count: number;
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

interface ScoreDataPoint {
  timestamp: number;
  audioScore: number;
  expressionScore: number;
}

// スコアに応じて画像を選択する関数
const getImageByScore = (score: number, type: 'mega' | 'giran') => {
  const images = type === 'mega'
    ? [Mega1, Mega2, Mega3, Mega4]
    : [Giran1, Giran2, Giran3, Giran4];

  if (score < 25) return images[0];
  if (score < 50) return images[1];
  if (score < 75) return images[2];
  return images[3];
};

function ResultsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionId = searchParams.get('sessionId');
  
  const [openAccordions, setOpenAccordions] = useState<Record<string, boolean>>({})
  const [results, setResults] = useState<SessionResult | null>(null);
  const [scoreHistories, setScoreHistories] = useState<Record<string, ScoreDataPoint[]>>({});

  useEffect(() => {
    const resultsStr = localStorage.getItem('sessionResults');
    if (!resultsStr) {
      router.push('/');
      return;
    }

    const data: SessionResult = JSON.parse(resultsStr);
    setResults(data);

    // 各グループのスコア履歴を読み込む
    const histories: Record<string, ScoreDataPoint[]> = {};
    data.results.forEach(result => {
      const historyKey = `scoreHistory_${data.session_id}_${result.group_id}`;
      const historyStr = localStorage.getItem(historyKey);
      if (historyStr) {
        try {
          histories[result.group_id] = JSON.parse(historyStr);
        } catch (e) {
          console.error(`Failed to parse score history for ${result.group_id}:`, e);
          histories[result.group_id] = [];
        }
      } else {
        histories[result.group_id] = [];
      }
    });
    setScoreHistories(histories);
  }, [router]);

  const handleRestart = () => {
    localStorage.clear();
    router.push('/');
  };

  const handleToggle = (groupId: string) => {
    setOpenAccordions(prev => ({
      ...prev,
      [groupId]: !prev[groupId]
    }))
  }

  if (!results) {
    return (
      <div className="min-h-screen bg-yellow-100 flex items-center justify-center">
        <p className="text-white text-xl">読み込み中...</p>
      </div>
    );
  }

  const winnerGroup = results.results.find(r => r.group_id === results.winner_group_id);

  return (
    <div className="min-h-screen p-4 pb-20">
      <CirclesBackground/>
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
                        <span className="font-bold text-yellow-600">{((result.audio_score / 70) * 100).toFixed(0)}/100点</span>
                      </div>
                      <div className="flex justify-center my-4">
                        <Image
                          src={getImageByScore(((result.audio_score / 70) * 100), 'mega')}
                          alt={`Mega${Math.floor(((result.audio_score / 70) * 100) / 25) + 1}`}
                          width={150}
                          height={150}
                          className="object-contain"
                        />
                      </div>
                      <div className="flex justify-between ">
                        <span className="text-sm text-gray-600">平均スコア:</span>
                        <span className="text-sm text-gray-700">{((result.audio_details.avg_score / 70) * 100).toFixed(0)}/100</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-600">最大スコア:</span>
                        <span className="text-sm text-gray-700">{((result.audio_details.max_score / 70) * 100).toFixed(0)}/100</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-600">平均dB:</span>
                        <span className="text-sm text-gray-700">{result.audio_details.avg_db.toFixed(1)} dB</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-600">高周波数割合:</span>
                        <span className="text-sm text-gray-700">{result.audio_details.avg_high_freq_percentage.toFixed(1)}%</span>
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
                        <span className="font-bold text-red-600 ">{result.expression_score.toFixed(0)}/100点</span>
                      </div>
                      <div className="flex justify-center my-4">
                        <Image
                          src={getImageByScore(result.expression_score, 'giran')}
                          alt={`Giran${Math.floor(result.expression_score / 25) + 1}`}
                          width={150}
                          height={150}
                          className="object-contain"
                        />
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-600">平均スコア:</span>
                        <span className="text-sm text-gray-700">{result.expression_details.avg_score.toFixed(0)}/100</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-600">最高スコア:</span>
                        <span className="text-sm text-gray-700">{result.expression_details.max_score.toFixed(0)}/100</span>
                      </div>
                    </div>
                       {scoreHistories[result.group_id] && scoreHistories[result.group_id].length > 0 && (
                          <div className="mt-6">
                            <div className="grid grid-cols-1 gap-4">
                            {/* 表情スコア時系列グラフ */}
                             
                            </div>
                          </div>
                      )}
                  </div>
                </div>
                <div></div>
                {/*アコーディオン*/}
                <div className="gap-4 mt-8">
                  <Accordion
                        title={'スコアの詳細を表示する'}
                        content={

                          <div>

                          {scoreHistories[result.group_id] && scoreHistories[result.group_id].length > 0 && (
                            <div className="mt-6">
                              <div className="grid grid-cols-2 gap-4">
                                {/* 音声スコア時系列グラフ */}

                                <div className="bg-yellow-50 rounded-lg p-4">
                                <ScoreTimelineChart
                                  scoreHistory={scoreHistories[result.group_id]}
                                  type="audio"
                                  color="#f59e0b"
                                  title="音声スコアの推移"
                                />
                                <BadgeDistributionChart
                                  scoreHistory={scoreHistories[result.group_id]}
                                  type="audio"
                                  color="#f59e0b"
                                  title="音声バッジ分布"
                                  badgeNames={['Mega1', 'Mega2', 'Mega3', 'Mega4']}
                                />
                                </div>
                                <div className="bg-red-50 rounded-lg p-4">
                                <ScoreTimelineChart
                                scoreHistory={scoreHistories[result.group_id]}
                                type="expression"
                                color="#ef4444"
                                title="表情スコアの推移"
                                />
                                <BadgeDistributionChart
                                  scoreHistory={scoreHistories[result.group_id]}
                                  type="expression"
                                  color="#ef4444"
                                  title="表情バッジ分布"
                                  badgeNames={['Giran1', 'Giran2', 'Giran3', 'Giran4']}
                                />
                                </div>
                              </div>
                            </div>
                          )}</div>

                        }
                        isOpen={!!openAccordions[result.group_id]}
                        onToggle={() => handleToggle(result.group_id)}
                      />
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
            <li>• <strong>音声スコア </strong>: 発話の音量と活発さを評価</li>
            <li>• <strong>表情スコア </strong>: 笑顔や表情の豊かさを評価</li>
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
