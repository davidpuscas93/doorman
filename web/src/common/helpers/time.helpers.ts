export const formatCountdown = (seconds: number) => {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
};

export const subscribeToSecond = (onChange: () => void) => {
  const timer = setInterval(onChange, 1000);
  return () => clearInterval(timer);
};

export const getNowSeconds = () => Math.floor(Date.now() / 1000);

export const getServerNowSeconds = () => 0;
