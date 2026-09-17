import { useEffect, useRef, useState } from 'react';
import { Button, Modal, Slider, Space, Typography } from 'antd';

const VIEWPORT = 320;
const OUTPUT_SIZE = 512;

interface AvatarCropModalProps {
  file: File | null;
  open: boolean;
  onCancel: () => void;
  onConfirm: (file: File) => Promise<void>;
}

export function AvatarCropModal({ file, open, onCancel, onConfirm }: AvatarCropModalProps) {
  const [sourceUrl, setSourceUrl] = useState<string>();
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 });
  const [saving, setSaving] = useState(false);
  const dragging = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!file) {
      setSourceUrl(undefined);
      return undefined;
    }
    const url = URL.createObjectURL(file);
    setSourceUrl(url);
    setZoom(1);
    setOffset({ x: 0, y: 0 });
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const baseScale = imageSize.width && imageSize.height
    ? Math.max(VIEWPORT / imageSize.width, VIEWPORT / imageSize.height)
    : 1;
  const scaledWidth = imageSize.width * baseScale * zoom;
  const scaledHeight = imageSize.height * baseScale * zoom;
  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return;
    setOffset((current) => ({
      x: current.x + event.clientX - dragging.current!.x,
      y: current.y + event.clientY - dragging.current!.y,
    }));
    dragging.current = { x: event.clientX, y: event.clientY };
  };

  const confirm = async () => {
    if (!sourceUrl || !imageSize.width || !imageSize.height) return;
    setSaving(true);
    try {
      const image = new Image();
      image.src = sourceUrl;
      await image.decode();
      const scale = baseScale * zoom;
      const cropSide = Math.min(image.width, VIEWPORT / scale);
      const centerX = image.width / 2 - offset.x / scale;
      const centerY = image.height / 2 - offset.y / scale;
      const sx = Math.max(0, Math.min(image.width - cropSide, centerX - cropSide / 2));
      const sy = Math.max(0, Math.min(image.height - cropSide, centerY - cropSide / 2));
      const canvas = document.createElement('canvas');
      canvas.width = OUTPUT_SIZE;
      canvas.height = OUTPUT_SIZE;
      canvas.getContext('2d')!.drawImage(image, sx, sy, cropSide, cropSide, 0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error('头像裁剪失败')), 'image/png'));
      await onConfirm(new File([blob], 'avatar-cropped.png', { type: 'image/png' }));
    } finally {
      setSaving(false);
    }
  };

  return <Modal title="裁剪头像" open={open} onCancel={onCancel} footer={null} destroyOnClose>
    <Space direction="vertical" size={14} style={{ width: '100%', alignItems: 'center' }}>
      <div
        onPointerDown={(event) => { dragging.current = { x: event.clientX, y: event.clientY }; event.currentTarget.setPointerCapture(event.pointerId); }}
        onPointerMove={onPointerMove}
        onPointerUp={() => { dragging.current = null; }}
        onPointerCancel={() => { dragging.current = null; }}
        style={{ width: VIEWPORT, height: VIEWPORT, borderRadius: '50%', overflow: 'hidden', background: '#111820', cursor: 'grab', touchAction: 'none' }}
      >
        {sourceUrl && <img
          src={sourceUrl}
          alt="头像预览"
          onLoad={(event) => setImageSize({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })}
          draggable={false}
          style={{ width: scaledWidth, height: scaledHeight, maxWidth: 'none', transform: `translate(${(VIEWPORT - scaledWidth) / 2 + offset.x}px, ${(VIEWPORT - scaledHeight) / 2 + offset.y}px)`, transformOrigin: 'top left', userSelect: 'none', pointerEvents: 'none' }}
        />}
      </div>
      <Typography.Text type="secondary">拖动调整位置，滑块调整缩放</Typography.Text>
      <Slider min={1} max={3} step={0.01} value={zoom} onChange={setZoom} style={{ width: VIEWPORT }} />
      <Space>
        <Button onClick={onCancel} disabled={saving}>取消</Button>
        <Button type="primary" onClick={() => void confirm()} loading={saving}>使用头像</Button>
      </Space>
    </Space>
  </Modal>;
}
