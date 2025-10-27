"use client"

import { useEffect, useState } from "react"

const cheeringMessages = ["盛り上げろー！", "がんばれー！", "ファイトー！", "いけー！", "応援してるよー！"]

interface FloatingText {
  id: number
  text: string
  delay: number
  duration: number
  startY: number
}

export function MovingBackground() {
  const [floatingTexts, setFloatingTexts] = useState<FloatingText[]>([])

  useEffect(() => {
    // 各メッセージごとに複数のテキストを生成
    const texts: FloatingText[] = []
    let id = 0

    cheeringMessages.forEach((message) => {
      // 各メッセージを5〜8個ずつ生成
      const count = Math.floor(Math.random() * 4) + 5
      for (let i = 0; i < count; i++) {
        texts.push({
          id: id++,
          text: message,
          delay: Math.random() * 10, // 0-10秒のランダムな遅延
          duration: 15 + Math.random() * 10, // 15-25秒のランダムな持続時間
          startY: Math.random() * 100, // 0-100%のランダムな開始位置
        })
      }
    })

    setFloatingTexts(texts)
  }, [])

  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none -z-10">
      {floatingTexts.map((item) => (
        <div
          key={item.id}
          className="absolute text-4xl md:text-6xl font-bold opacity-10 whitespace-nowrap"
          style={{
            left: "-10%",
            top: `${item.startY}%`,
            animation: `diagonal-flow ${item.duration}s linear ${item.delay}s infinite`,
            color: "currentColor",
          }}
        >
          {item.text}
        </div>
      ))}
      <style jsx>{`
        @keyframes diagonal-flow {
          0% {
            transform: translate(0, 0) rotate(-45deg);
          }
          100% {
            transform: translate(150vw, -150vh) rotate(-45deg);
          }
        }
      `}</style>
    </div>
  )
}
