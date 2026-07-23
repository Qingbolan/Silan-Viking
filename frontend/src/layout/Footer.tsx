import React from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowUpRight,
  Github,
  Globe2,
  GraduationCap,
  Linkedin,
  Mail,
  Moon,
  Sun,
} from 'lucide-react';
import { motion, useReducedMotion } from 'framer-motion';
import { useLanguage } from '../components/LanguageContext';
import { useTheme } from '../components/ThemeContext';
import { publicAssetUrl } from '../utils/publicAsset';
import { Avatar } from '../components/ds/Avatar';

type InternalLink = { label: string; to: string };

const FooterLink: React.FC<{ item: InternalLink }> = ({ item }) => (
  <Link
    to={item.to}
    className="group inline-flex min-h-10 items-center gap-1.5 text-sm text-white/55 transition-colors duration-200 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
  >
    <span className="border-b border-transparent pb-px transition-colors duration-200 group-hover:border-white/55">
      {item.label}
    </span>
    <ArrowUpRight className="size-3 opacity-0 transition-all duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:opacity-80" aria-hidden />
  </Link>
);

const ExternalLink: React.FC<{ href: string; label: string; icon?: React.ReactNode }> = ({ href, label, icon }) => (
  <a
    href={href}
    target="_blank"
    rel="noopener noreferrer"
    className="group inline-flex min-h-10 items-center gap-1.5 text-sm text-white/55 transition-colors duration-200 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
  >
    {icon}
    <span className="border-b border-transparent pb-px transition-colors duration-200 group-hover:border-white/55">{label}</span>
    <ArrowUpRight className="size-3 opacity-0 transition-all duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:opacity-80" aria-hidden />
  </a>
);

/**
 * A full-width closing signature for every route.
 *
 * It deliberately has its own graphite material in both global themes: this
 * gives the site a stable final landmark and lets the oversized wordmark read
 * as a personal sign-off rather than another content panel.
 */
const Footer: React.FC = () => {
  const { language, setLanguage } = useLanguage();
  const { isDarkMode, toggleTheme } = useTheme();
  const reduceMotion = useReducedMotion();
  const zh = language === 'zh';

  const explore: InternalLink[] = [
    { label: zh ? '主页' : 'Home', to: '/' },
    { label: zh ? '项目' : 'Projects', to: '/projects' },
    { label: zh ? '博客' : 'Writing', to: '/blog' },
  ];
  const research: InternalLink[] = [
    { label: zh ? '瞬间' : 'Moments', to: '/moments' },
    { label: zh ? '联系' : 'Contact', to: '/contact' },
  ];

  return (
    <footer className="relative overflow-hidden bg-[#17181a] text-white">
      <div aria-hidden className="absolute inset-x-0 top-0 h-px bg-white/10" />
      <div aria-hidden className="absolute left-0 top-0 h-72 w-72 rounded-full bg-[#305d9f]/15 blur-3xl sm:-translate-x-1/3" />

      <div className="relative mx-auto grid max-w-7xl grid-cols-2 gap-x-6 gap-y-10 px-5 pb-12 pt-12 sm:px-10 sm:pb-16 sm:pt-16 lg:grid-cols-[1.35fr_0.65fr_0.65fr_0.8fr] lg:gap-8 lg:px-12">
        <section className="col-span-2 max-w-sm lg:col-span-1">
          <Link
            to="/"
            className="inline-flex min-h-11 items-center gap-3 text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
            aria-label={zh ? '返回主页' : 'Back to home'}
          >
            <Avatar
              src={publicAssetUrl('/image.png')}
              name="Silan Hu"
              size="sm"
              bordered={false}
              className="size-10"
            />
            <span className="text-base font-semibold tracking-[-0.035em]">Silan Hu</span>
          </Link>
          <p className="mt-5 text-sm leading-6 text-white/55">
            {zh ? 'AI 系统研究者，构建可执行智能体的知识与运行时基础设施。' : 'AI systems researcher building knowledge and runtime infrastructure for executable agents.'}
          </p>
          <div className="mt-6 flex items-center gap-1">
            <ExternalLink href="https://github.com/Qingbolan" label="GitHub" icon={<Github className="size-4" aria-hidden />} />
            <ExternalLink href="https://linkedin.com/in/qingbolan" label="LinkedIn" icon={<Linkedin className="size-4" aria-hidden />} />
            <ExternalLink href="https://scholar.google.com/citations?user=HW1b7oYAAAAJ&hl=en" label="Scholar" icon={<GraduationCap className="size-4" aria-hidden />} />
          </div>
          <a
            href="mailto:silan.hu@comp.nus.edu.sg"
            className="mt-2 inline-flex min-h-10 items-center gap-2 text-sm text-white/55 transition-colors hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
          >
            <Mail className="size-4" aria-hidden />
            silan.hu@comp.nus.edu.sg
          </a>
        </section>

        <nav aria-label={zh ? '浏览' : 'Explore'}>
          <h2 className="font-mono text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-white/90">{zh ? '浏览' : 'Explore'}</h2>
          <div className="mt-3 flex flex-col">{explore.map((item) => <FooterLink key={item.to} item={item} />)}</div>
        </nav>

        <nav aria-label={zh ? '研究' : 'Research'}>
          <h2 className="font-mono text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-white/90">{zh ? '研究' : 'Research'}</h2>
          <div className="mt-3 flex flex-col">{research.map((item) => <FooterLink key={item.to} item={item} />)}</div>
        </nav>

        <section className="col-span-2 lg:col-span-1">
          <h2 className="font-mono text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-white/90">{zh ? '所在' : 'Based in'}</h2>
          <p className="mt-3 text-sm leading-6 text-white/55">Singapore / Beijing<br />NUS Computing</p>
          <div className="mt-5 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={toggleTheme}
              className="inline-flex min-h-10 items-center gap-2 rounded-full border border-white/20 px-3 text-xs font-medium text-white/70 transition-colors hover:border-white/45 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
            >
              {isDarkMode ? <Sun className="size-3.5" aria-hidden /> : <Moon className="size-3.5" aria-hidden />}
              {zh ? (isDarkMode ? '浅色' : '深色') : (isDarkMode ? 'Light' : 'Dark')}
            </button>
            <button
              type="button"
              onClick={() => setLanguage(zh ? 'en' : 'zh')}
              className="inline-flex min-h-10 items-center gap-2 rounded-full border border-white/20 px-3 text-xs font-medium text-white/70 transition-colors hover:border-white/45 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
            >
              <Globe2 className="size-3.5" aria-hidden />
              {zh ? 'English' : '中文'}
            </button>
          </div>
        </section>
      </div>

      <div className="relative mx-auto max-w-7xl px-5 sm:px-10 lg:px-12">
        <div className="border-t border-white/10 pt-5 text-xs text-white/40">
          © {new Date().getFullYear()} Silan Hu. {zh ? '保留所有权利。' : 'All rights reserved.'}
        </div>
      </div>

      <motion.div
        aria-hidden
        className="relative mt-8 select-none overflow-hidden px-3 pb-28 text-center text-white/[0.18] sm:mt-12 sm:px-8 sm:pb-10"
        initial={reduceMotion ? false : { opacity: 0, y: 28 }}
        whileInView={reduceMotion ? undefined : { opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.15 }}
        transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
      >
        <motion.span
          className="block whitespace-nowrap font-signature text-[clamp(4.8rem,12.5vw,15.5rem)] font-normal leading-[0.82] tracking-[-0.025em]"
          animate={reduceMotion ? undefined : { y: [0, -4, 0], rotate: [0, -0.35, 0], scaleX: [1.035, 1.055, 1.035], opacity: [0.82, 1, 0.82] }}
          transition={reduceMotion ? undefined : { duration: 8, repeat: Infinity, ease: 'easeInOut' }}
          whileHover={reduceMotion ? undefined : { y: -8, scaleX: 1.085, scaleY: 1.012, opacity: 1, transition: { duration: 0.3, ease: [0.16, 1, 0.3, 1] } }}
        >
          <span>Silan</span>
          <span className="mx-[0.14em] inline-block sm:mx-[0.26em]">.</span>
          <span>Hu</span>
        </motion.span>
      </motion.div>
    </footer>
  );
};

export default Footer;
