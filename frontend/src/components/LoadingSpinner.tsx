
export default function LoadingSpinner({ fullScreen = false }: { fullScreen?: boolean }) {
  if (fullScreen) {
    return (
      <div className="loading-container full-screen">
        <div className="spinner"></div>
      </div>
    );
  }
  
  return (
    <div className="loading-container">
      <div className="spinner"></div>
    </div>
  );
}
