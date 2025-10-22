'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { io, Socket } from 'socket.io-client';

interface GroupConfig {
  id: string;
  name: string;
  url: string;
  joined: boolean;
}

export default function RoomsPage() {
  const router = useRouter();
  const [sessionConfig, setSessionConfig] = useState<any>(null);
  const [groups, setGroups] = useState<GroupConfig[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [socket, setSocket] = useState<Socket | null>(null);

  useEffect(() => {
    // セッション設定を取得
    const configStr = localStorage.getItem('sessionConfig');
    if (!configStr) {
      router.push('/');
      return;
    }

    const config = JSON.parse(configStr);
    setSessionConfig(config);

    // グループを初期化（最初のグループは「マスター」）
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

    // Socket.IO接続でグループの参加状態を監視
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
    const newSocket = io(apiUrl);

    newSocket.on('connect', () => {
      console.log('Connected to server for room monitoring');
      // セッションに参加してグループ状態を監視
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
    // グループ設定を保存
    localStorage.setItem('selectedGroup', JSON.stringify({
      groupId,
      groupName: groups.find(g => g.id === groupId)?.name
    }));

    // セッション画面に遷移
    router.push(`/session?sessionId=${sessionConfig.sessionId}&groupId=${groupId}`);
  };

  if (!sessionConfig) {
    return <div>Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-yellow-100 p-4">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-2xl shadow-2xl p-8">
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
                    {/* グループ名入力と状態表示 */}
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

                    {/* URL表示とコピー */}
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={group.url}
                        readOnly
                        className="flex-1 px-4 py-2 bg-gray-50 border border-gray-300 rounded-lg text-sm text-gray-600"
                      />
                      <button
                        onClick={() => handleCopyURL(group.id, group.url)}
                        className="px-4 py-2 bg-yellow-500 text-white rounded-lg hover:bg-yellow-600 transition"
                      >
                        {copiedId === group.id ? 'コピー済み!' : 'コピー'}
                      </button>
                    </div>

                    {/* 参加ボタン */}
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
    </div>
  );
}
