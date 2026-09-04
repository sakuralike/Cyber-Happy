import { useState } from 'react';
import { Upload, Button, Progress, message } from 'antd';
import { UploadOutlined } from '@ant-design/icons';
import { uploadFile, type FileBizType } from '../api/file';

interface FileUploadProps {
  bizType: FileBizType;
  accept?: string;
  value?: string; // file asset id
  onChange?: (fileId?: string) => void;
  onFileMeta?: (meta: { name: string; size: number; url: string }) => void;
}

/** 文件上传（走 /files/upload，返回资产 id 供版本/模型表单引用） */
export function FileUpload({ bizType, accept, value, onChange, onFileMeta }: FileUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [pct, setPct] = useState(0);

  const customRequest = async (options: { file: File | Blob; onSuccess: () => void; onError: (e: Error) => void }) => {
    const file = options.file as File;
    setUploading(true);
    setPct(0);
    try {
      const asset = await uploadFile(bizType, file, setPct);
      onChange?.(asset.id);
      onFileMeta?.({ name: asset.originalName, size: asset.size, url: asset.url });
      options.onSuccess();
      message.success('上传成功');
    } catch (e) {
      options.onError(e as Error);
      message.error((e as Error).message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div>
      <Upload
        accept={accept}
        showUploadList={false}
        customRequest={customRequest as never}
        disabled={uploading}
      >
        <Button icon={<UploadOutlined />} loading={uploading}>
          {value ? '重新上传' : '上传文件'}
        </Button>
      </Upload>
      {uploading && <Progress percent={pct} size="small" style={{ marginTop: 8, maxWidth: 360 }} />}
    </div>
  );
}
