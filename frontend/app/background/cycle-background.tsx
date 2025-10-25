"use client"

export default function CirclesBackground() {
  return (
    <div className="fixed inset-0 -z-10 overflow-hidden bg-white">
      {/* Yellow circle */}
      <div
        className="absolute h-[250px] w-[250px] rounded-full bg-yellow-300 opacity-60 blur-[100px]"
        style={{
          top: "10%",
          left: "10%",
          animation: "float-slow 20s ease-in-out infinite",
          animationDelay: "0s",
        }}
      />

      {/* Orange/Red circle */}
      <div
        className="absolute h-[280px] w-[280px] rounded-full bg-orange-500 opacity-70 blur-[100px]"
        style={{
          top: "15%",
          right: "15%",
          animation: "float-medium 15s ease-in-out infinite",
          animationDelay: "2s",
        }}
      />

      {/* Blue circle */}
      <div
        className="absolute h-[300px] w-[300px] rounded-full bg-blue-600 opacity-65 blur-[100px]"
        style={{
          bottom: "10%",
          left: "35%",
          animation: "float-slow 20s ease-in-out infinite",
          animationDelay: "4s",
        }}
      />
    </div>
  )
}
