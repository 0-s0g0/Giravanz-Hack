'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { io, Socket } from 'socket.io-client';
import CirclesBackground from '@/app/background/cycle-background'
// 💡 QRコードライブラリをインポート
import { QRCodeSVG as QRCode } from 'qrcode.react'

interface GroupConfig {
  id: string;
  name: string;
  url: string;
  joined: boolean;
}

// 💡 QRコードモーダルコンポーネントを追加
const QRCodeModal = ({ url, onClose }: { url: string, onClose: () => void }) => {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl p-6 shadow-2xl relative" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-xl font-bold mb-4 text-center">グループ参加URL</h2>
        <div className="flex justify-center mb-4 p-4 border rounded-lg">
          {/* QRコードの生成 */}
          <QRCode
            value={url}
            size={256}
            level="H"
          />
        </div>
        <p className="text-sm text-gray-600 text-center break-words">{url}</p>
        <button
          onClick={onClose}
          className="absolute top-2 right-2 text-gray-500 hover:text-gray-800 text-2xl"
        >
          &times;
        </button>
      </div>
    </div>
  );
};


export default function RoomsPage() {
  const router = useRouter();
  const [sessionConfig, setSessionConfig] = useState<any>(null);
  const [groups, setGroups] = useState<GroupConfig[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [socket, setSocket] = useState<Socket | null>(null);
  // 💡 QRコード表示用のステートを追加
  const [qrModalUrl, setQrModalUrl] = useState<string | null>(null);

  useEffect(() => {
    // ... (既存のuseEffectロジックは変更なし) ...
    const configStr = localStorage.getItem('sessionConfig');
    if (!configStr) {
      router.push('/');
      return;
    }

    const config = JSON.parse(configStr);
    setSessionConfig(config);

    const initialGroups: GroupConfig[] = [];
    for (let i = 0; i < config.numGroups; i++) {
      const groupId = `group_${i + 1}`;
      const url = `${window.location.origin}/session?sessionId=${config.sessionId}&groupId=${groupId}`;
      initialGroups.push({
        id: groupId,
        name: i === 0 ? 'マスター' : `グループ ${i + 1}`,
        url,
        joined: false
      });
    }
    setGroups(initialGroups);

    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
    const newSocket = io(apiUrl);

    newSocket.on('connect', () => {
      console.log('Connected to server for room monitoring');
      newSocket.emit('monitor_session', { session_id: config.sessionId });
    });

    newSocket.on('group_joined', (data: { group_id: string }) => {
      console.log('Group joined:', data);
      setGroups(prev => prev.map(g =>
        g.id === data.group_id ? { ...g, joined: true } : g
      ));
    });

    setSocket(newSocket);

    return () => {
      newSocket.close();
    };
  }, [router]);

  const handleGroupNameChange = (index: number, name: string) => {
    const newGroups = [...groups];
    newGroups[index].name = name;
    setGroups(newGroups);
  };

  const handleCopyURL = (groupId: string, url: string) => {
    navigator.clipboard.writeText(url);
    setCopiedId(groupId);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleStartSession = (groupId: string) => {
    localStorage.setItem('selectedGroup', JSON.stringify({
      groupId,
      groupName: groups.find(g => g.id === groupId)?.name
    }));
    router.push(`/session?sessionId=${sessionConfig.sessionId}&groupId=${groupId}`);
  };

  if (!sessionConfig) {
    return <div>Loading...</div>;
  }

  return (
    <div className="min-h-screen p-4">
      <CirclesBackground/>
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-2xl shadow-2xl p-8">
          {/* ... (タイトルなどの既存コードは変更なし) ... */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-800 mb-2">
              ルーム選択
            </h1>
            <p className="text-gray-600">
              各グループの名前を入力し、URLを共有してください
            </p>
            <div className="mt-4 flex gap-4 text-sm">
              <span className="px-3 py-1 bg-yellow-100 text-yellow-800 rounded-full">
                グループ数: {sessionConfig.numGroups}
              </span>
              <span className="px-3 py-1 bg-red-100 text-red-800 rounded-full">
                制限時間: {sessionConfig.durationMinutes}分
              </span>
            </div>
          </div>

          <div className="space-y-4">
            {groups.map((group, index) => (
              <div
                key={group.id}
                className={`border rounded-lg p-6 hover:shadow-lg transition ${
                  group.joined ? 'border-green-400 bg-green-50' : 'border-gray-200'
                }`}
              >
                <div className="flex items-start gap-4">
                  <div className={`flex-shrink-0 w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-lg ${
                    index === 0
                      ? 'bg-gradient-to-br from-yellow-400 to-yellow-600'
                      : 'bg-gradient-to-br from-yellow-500 to-red-600'
                  }`}>
                    {index === 0 ? 'M' : index + 1}
                  </div>

                  <div className="flex-1 space-y-3">
                    {/* グループ名入力と状態表示 (変更なし) */}
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={group.name}
                        onChange={(e) => handleGroupNameChange(index, e.target.value)}
                        placeholder={`グループ ${index + 1} の名前`}
                        className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-yellow-500 focus:border-transparent outline-none"
                        disabled={index === 0}
                      />
                      {group.joined && (
                        <span className="px-3 py-1 bg-green-500 text-white text-sm font-semibold rounded-full flex items-center gap-1">
                          <span className="w-2 h-2 bg-white rounded-full animate-pulse"></span>
                          参加中
                        </span>
                      )}
                    </div>

                    {/* URL表示とコピー、QRコードボタン */}
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={group.url}
                        readOnly
                        className="flex-1 px-4 py-2 bg-gray-50 border border-gray-300 rounded-lg text-sm text-gray-600"
                      />
                      {/* 💡 QRコード表示ボタンを追加 */}
                      <button
                        onClick={() => setQrModalUrl(group.url)}
                        className="px-4 py-2 bg-gray-300 text-gray-800 rounded-lg hover:bg-gray-400 transition font-bold"
                        title="QRコードを表示"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M3 11h8V3H3v8zm10-8v8h8V3h-8zM3 21h8v-8H3v8zm10 0h8v-8h-8v8zM5 5h4v4H5V5zm10 0h4v4h-4V5zM5 15h4v4H5v-4zm10 0h4v4h-4v-4z"/>
                        </svg>
                      </button>

                      {/* コピーボタン */}
                      <button
                        onClick={() => handleCopyURL(group.id, group.url)}
                        className="px-4 py-2 bg-yellow-500 text-white rounded-lg hover:bg-yellow-600 transition"
                      >
                        {copiedId === group.id ? 'コピー済み!' : 'コピー'}
                      </button>
                    </div>

                    {/* 参加ボタン (変更なし) */}
                    <button
                      onClick={() => handleStartSession(group.id)}
                      className="w-full bg-gradient-to-r from-yellow-500 to-red-600 text-white font-semibold py-2 px-4 rounded-lg hover:from-yellow-600 hover:to-red-700 transition"
                    >
                      このグループで参加
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* ... (注意事項などの既存コードは変更なし) ... */}
          <div className="mt-8 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
            <h3 className="font-semibold text-yellow-800 mb-2">注意事項</h3>
            <ul className="text-sm text-yellow-700 space-y-1">
              <li>• URLを共有してメンバーを招待してください</li>
              <li>• 各グループは独自のルームで分析されます</li>
              <li>• セッション開始後は全グループ同時に計測が始まります</li>
            </ul>
          </div>
        </div>
      </div>
      
      {/* 💡 QRコードモーダルのレンダリング */}
      {qrModalUrl && (
        <QRCodeModal url={qrModalUrl} onClose={() => setQrModalUrl(null)} />
      )}
    </div>
  );
}