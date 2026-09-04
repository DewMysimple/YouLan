import { useEffect, useRef, useState } from 'react';
import { createSpecimenViewer } from './viewer/createSpecimenViewer.js';

export default function App() {
  const viewerRef = useRef(null);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (!viewerRef.current) return undefined;

    setErrorMessage('');

    const disposeViewer = createSpecimenViewer(viewerRef.current, {
      onError(error) {
        setErrorMessage(error.message || '场景加载失败，请检查浏览器控制台。');
      },
    });

    return disposeViewer;
  }, []);

  return (
    <main className="app-shell">
      <div ref={viewerRef} className="viewer" aria-label="幽兰标本与花粉星云三维场景" />
      {errorMessage ? (
        <div className="error-message" role="alert">
          {errorMessage}
        </div>
      ) : null}
    </main>
  );
}

