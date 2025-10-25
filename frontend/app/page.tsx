'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import CirclesBackground from '@/app/background/cycle-background'

export default function Home() {
  const router = useRouter();
  const [numGroups, setNumGroups] = useState<number>(2);
  const [duration, setDuration] = useState<number>(5);

  const handleStart = () => {
    // セッションIDを生成
    const sessionId = `session_${Date.now()}`;

    // 設定をローカルストレージに保存
    localStorage.setItem('sessionConfig', JSON.stringify({
      sessionId,
      numGroups,
      durationMinutes: duration
    }));

    // ルーム選択画面に遷移
    router.push('/rooms');
  };

  return (
    <div className="min-h-screen bg-white flex items-center justify-center p-4">
      <CirclesBackground/>
      <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-800 mb-2">
            Team Engagement Analyzer
          </h1>
          <p className="text-gray-600">
            チームの盛り上がり度を分析
          </p>
        </div>

        <div className="space-y-6">
          {/* グループ数入力 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              グループ数
            </label>
            <input
              type="number"
              min="2"
              max="10"
              value={numGroups}
              onChange={(e) => setNumGroups(parseInt(e.target.value) || 2)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-yellow-500 focus:border-transparent outline-none transition"
            />
            <p className="mt-1 text-xs text-gray-500">
              2〜10グループまで設定できます
            </p>
          </div>

          {/* 制限時間入力 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              制限時間（分）
            </label>
            <input
              type="number"
              min="1"
              max="60"
              value={duration}
              onChange={(e) => setDuration(parseInt(e.target.value) || 5)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-yellow-500 focus:border-transparent outline-none transition"
            />
            <p className="mt-1 text-xs text-gray-500">
              1〜60分まで設定できます
            </p>
          </div>

          {/* 開始ボタン */}
          <button
            onClick={handleStart}
            className="w-full bg-gradient-to-r from-yellow-500 to-red-600 text-white font-semibold py-3 px-6 rounded-lg  transform hover:scale-105 transition duration-200 shadow-lg"
          >
            開始
          </button>
        </div>

        {/* 説明 */}
        <div className="mt-8 p-4 bg-yellow-50 rounded-lg">
          <h3 className="font-semibold text-gray-800 mb-2">使い方</h3>
          <ol className="text-sm text-gray-600 space-y-1 list-decimal list-inside">
            <li>グループ数と制限時間を設定</li>
            <li>各グループの名前を入力</li>
            <li>URLを共有してメンバーを招待</li>
            <li>セッション開始で分析スタート</li>
          </ol>
        </div>
      </div>
    </div>
  );
}
