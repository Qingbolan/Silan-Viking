import React, { useState } from 'react';
import { Image, Card, Tag, Typography, Spin } from 'antd';
import { ExpandOutlined } from '@ant-design/icons';
import { BlogContent } from '../../types/blog';
import { useLanguage } from '../../../LanguageContext';
import FuzzyText from '../../../ui/FuzzyText';

const { Paragraph } = Typography;

interface ImageContentProps {
  item: BlogContent;
  index: number;
  isWideScreen: boolean;
}

export const ImageContent: React.FC<ImageContentProps> = ({ item, index, isWideScreen }) => {
  const { language } = useLanguage();
  const [, setLoading] = useState(true);
  const [imageError, setImageError] = useState(false);

  const imageSrc = item.content.startsWith('/api/placeholder')
    ? `https://via.placeholder.com/800x400/6366f1/ffffff?text=${encodeURIComponent(item.caption || 'Academic Figure')}`
    : item.content;

  return (
    <figure className={`my-16 ${isWideScreen ? 'col-span-2' : ''} break-inside-avoid`}>
      <Card
        className="overflow-hidden shadow-medium hover:shadow-lg transition-shadow duration-300"
        bodyStyle={{ padding: 0 }}
        style={{
          borderRadius: '12px',
          backgroundColor: 'var(--color-surfaceElevated)',
          borderColor: 'var(--color-cardBorder)'
        }}
      >
        {/* Image with Ant Design Image component */}
        <div className="relative overflow-hidden bg-theme-surface-secondary">
          {imageError ? (
            <div className="flex flex-col items-center justify-center h-96 bg-gradient-to-br from-theme-surface to-theme-surface-secondary">
              <FuzzyText
                fontSize="3.5rem"
                fontWeight={800}
                color="var(--color-textSecondary, #9ca3af)"
                baseIntensity={0.08}
                hoverIntensity={0.25}
              >
                {language === 'en' ? 'Image Not Found' : '图片加载失败'}
              </FuzzyText>
            </div>
          ) : (
            <Image
              src={imageSrc}
              alt={item.caption || 'Academic figure'}
              onLoad={() => setLoading(false)}
              onError={() => {
                setLoading(false);
                setImageError(true);
              }}
              placeholder={
                <div className="flex items-center justify-center h-96 bg-theme-surface/50">
                  <Spin size="large" />
                </div>
              }
              preview={{
                mask: (
                  <div className="flex flex-col items-center justify-center gap-2">
                    <ExpandOutlined style={{ fontSize: '28px', color: 'white' }} />
                    <span className="text-white text-sm font-medium">
                      {language === 'en' ? 'Click to preview' : '点击预览'}
                    </span>
                  </div>
                ),
                maskClassName: 'backdrop-blur-sm bg-black/30'
              }}
              style={{
                width: '100%',
                maxHeight: '600px',
                objectFit: 'contain',
                backgroundColor: 'var(--color-surfaceSecondary, #f9fafb)'
              }}
              className="transition-all duration-500"
            />
          )}
        </div>
        
        {/* Caption */}
        {item.caption && (
          <div className="p-6 bg-theme-surface-elevated">
            <div className="text-center space-y-2">
              {/* Figure Number Tag */}
              <Tag
                className="mb-2"
                style={{
                  borderRadius: '16px',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  color: 'var(--color-primary)',
                  background: 'var(--color-primaryLight)',
                  border: 'none',
                }}
              >
                Figure {index + 1}
              </Tag>
              
              {/* Caption Text */}
              <Paragraph 
                className="text-center max-w-2xl mx-auto"
                style={{ 
                  fontFamily: 'Georgia, "Times New Roman", Charter, serif',
                  fontSize: '14px',
                  lineHeight: '1.6',
                  color: 'var(--color-textSecondary, #6b7280)',
                  marginBottom: 0
                }}
              >
                {item.caption}
              </Paragraph>
            </div>
          </div>
        )}
      </Card>
    </figure>
  );
}; 