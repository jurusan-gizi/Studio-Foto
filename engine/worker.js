// Worker penghapus latar — berjalan terpisah agar tampilan tetap responsif
import { segmentForeground } from './bgr.mjs';

self.onmessage = async (e) => {
  const { blob, publicPath } = e.data;
  try {
    const out = await segmentForeground(blob, {
      publicPath,
      model: 'small',
      proxyToWorker: false,
      output: { format: 'image/x-alpha8' },
      progress: (key, cur, tot) => self.postMessage({ type: 'progress', key, cur, tot })
    });
    const buf = await out.arrayBuffer();
    self.postMessage({ type: 'done', buf }, [buf]);
  } catch (err) {
    self.postMessage({ type: 'error', message: String(err && err.message || err) });
  }
};
