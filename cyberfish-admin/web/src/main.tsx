import React from 'react';
import ReactDOM from 'react-dom/client';
import { ConfigProvider, App as AntApp } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import dayjs from 'dayjs';
import 'dayjs/locale/zh-cn';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import './styles.css';

dayjs.locale('zh-cn');

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 15_000,
    },
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ConfigProvider
      locale={zhCN}
      theme={{
        token: {
          colorPrimary: '#0B7C6E',
          colorSuccess: '#0E9F6E',
          colorInfo: '#2E6BFF',
          colorWarning: '#E8930C',
          colorError: '#DC2F3C',
          colorBgLayout: '#F7F8FA',
          colorBgContainer: '#FFFFFF',
          colorText: '#1C1C1E',
          colorTextSecondary: '#6B6F7E',
          colorBorder: '#C7CAD5',
          colorBorderSecondary: '#E0E2E8',
          borderRadius: 6,
          borderRadiusLG: 12,
          controlHeight: 36,
          fontFamily: "'Noto Sans SC', system-ui, -apple-system, sans-serif",
        },
        components: {
          Layout: { siderBg: '#14161A', headerBg: '#FFFFFF' },
          Menu: { darkItemBg: '#14161A', darkItemSelectedBg: '#16302C', darkItemSelectedColor: '#5FE3CE' },
          Card: { borderRadiusLG: 12 },
          Table: { headerBg: '#F7F8FA' },
        },
      }}
    >
      <AntApp>
        <QueryClientProvider client={queryClient}>
          <App />
        </QueryClientProvider>
      </AntApp>
    </ConfigProvider>
  </React.StrictMode>,
);
