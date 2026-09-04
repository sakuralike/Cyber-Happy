import { useEffect } from 'react';
import { Button, Card, Form, Input, message } from 'antd';
import { SaveOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as siteConfigApi from '../api/siteConfig';
import { FileUpload } from '../components/FileUpload';
import { notifyError } from '../api/client';

export function SiteConfigPage() {
  const [form] = Form.useForm<siteConfigApi.UpdateSiteConfigInput>();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['site-config'], queryFn: siteConfigApi.getSiteConfig });
  const updateMut = useMutation({
    mutationFn: siteConfigApi.updateSiteConfig,
    onSuccess: (value) => {
      form.setFieldsValue(value);
      qc.invalidateQueries({ queryKey: ['site-config'] });
      qc.invalidateQueries({ queryKey: ['site-config', 'public'] });
      message.success('首页配置已保存');
    },
    onError: notifyError,
  });

  useEffect(() => {
    if (data) form.setFieldsValue(data);
  }, [data, form]);

  return (
    <Card title="首页与下载配置" loading={isLoading}>
      <Form form={form} layout="vertical" onFinish={(values) => updateMut.mutate(values)}>
        <Form.Item name="title" label="首页标题" rules={[{ required: true, message: '请输入首页标题' }]}>
          <Input maxLength={120} />
        </Form.Item>
        <Form.Item name="content" label="首页介绍">
          <Input.TextArea rows={8} maxLength={10000} />
        </Form.Item>
        <Form.Item name="apkUrl" label="外部 APK 下载链接">
          <Input placeholder="可填写 HTTPS 链接；上传 APK 后可留空" onChange={() => form.setFieldsValue({ apkFileId: null })} />
        </Form.Item>
        <Form.Item name="apkFileId" label="上传 APK">
          <FileUpload
            bizType="APK"
            accept=".apk"
            value={data?.apkFileId ?? undefined}
            onChange={(id) => form.setFieldsValue({ apkFileId: id ?? null, apkUrl: null })}
          />
        </Form.Item>
        <Button type="primary" htmlType="submit" icon={<SaveOutlined />} loading={updateMut.isPending}>
          保存配置
        </Button>
      </Form>
    </Card>
  );
}
