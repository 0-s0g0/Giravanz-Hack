interface SessionControlsProps {
  isRunning: boolean;
  isReady: boolean;
  isMaster: boolean;
  waitingForMaster: boolean;
  groupName: string;
  readyStatus: Record<string, boolean>;
  onReady: () => void;
  onMasterStart: () => void;
  onSessionEnd: () => void;
}

export default function SessionControls({
  isRunning,
  isReady,
  isMaster,
  waitingForMaster,
  groupName,
  readyStatus,
  onReady,
  onMasterStart,
  onSessionEnd,
}: SessionControlsProps) {
  return (
    <div className="space-y-4">
      {!isRunning && !isReady && (
        <button
          onClick={onReady}
          className="w-full bg-gradient-to-r from-yellow-500 to-yellow-600 text-white font-semibold py-4 px-6 rounded-lg hover:from-yellow-600 hover:to-yellow-700 transform hover:scale-105 transition duration-200 shadow-lg"
        >
          準備OK
        </button>
      )}

      {isReady && !isRunning && isMaster && (
        <>
          {/* マスター用: 全グループの準備状態 */}
          <div className="bg-gray-50 rounded-lg p-4">
            <h3 className="font-semibold text-gray-800 mb-3">グループの準備状態</h3>
            <div className="space-y-2">
              {Object.entries(readyStatus).map(([gid, ready]) => (
                <div key={gid} className="flex items-center justify-between">
                  <span className="text-sm text-gray-700">{gid}</span>
                  {ready ? (
                    <span className="px-3 py-1 bg-green-500 text-white text-xs rounded-full">準備OK</span>
                  ) : (
                    <span className="px-3 py-1 bg-gray-300 text-gray-600 text-xs rounded-full">待機中</span>
                  )}
                </div>
              ))}
            </div>
          </div>

          <button
            onClick={onMasterStart}
            disabled={!Object.values(readyStatus).every(ready => ready)}
            className={`w-full font-semibold py-4 px-6 rounded-lg transition shadow-lg ${
              Object.values(readyStatus).every(ready => ready)
                ? 'bg-gradient-to-r from-green-500 to-green-600 text-white hover:from-green-600 hover:to-green-700 transform hover:scale-105'
                : 'bg-gray-300 text-gray-500 cursor-not-allowed'
            }`}
          >
            {Object.values(readyStatus).every(ready => ready)
              ? 'セッション開始'
              : '全グループの準備を待っています...'}
          </button>
        </>
      )}

      {isReady && !isRunning && !isMaster && waitingForMaster && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 text-center">
          <div className="text-4xl mb-3">⏳</div>
          <p className="text-lg font-semibold text-yellow-800 mb-2">
            マスターの承認を待っています
          </p>
          <p className="text-sm text-yellow-700">
            {groupName}が準備完了しました。マスターがセッションを開始するまでお待ちください。
          </p>
        </div>
      )}

      {isRunning && (
        <button
          onClick={onSessionEnd}
          className="w-full bg-gradient-to-r from-red-500 to-red-600 text-white font-semibold py-4 px-6 rounded-lg hover:from-red-600 hover:to-red-700 transition shadow-lg"
        >
          セッション終了
        </button>
      )}
    </div>
  );
}
