import type { GlobalThemeOverrides } from 'naive-ui'

function cssVar(name: string, fallback: string): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return v || fallback
}

/** 将脚手架 CSS 变量映射为 Naive UI 主题，与 tokens.css / 主题预设保持一致 */
export function buildNaiveThemeOverrides(): GlobalThemeOverrides {
  const brand = cssVar('--brand', '#1f7a67')
  const brandStrong = cssVar('--brand-strong', '#0f4b44')
  const radius = cssVar('--radius', '8px')
  const radiusMd = cssVar('--radius-md', '12px')

  return {
    common: {
      primaryColor: brand,
      primaryColorHover: brandStrong,
      primaryColorPressed: brandStrong,
      primaryColorSuppl: brand,
      borderRadius: radius,
      borderRadiusSmall: radius,
      fontFamily: cssVar('--font-sans', 'system-ui, sans-serif'),
      fontFamilyMono: cssVar('--font-mono', 'monospace'),
      fontSize: cssVar('--text-base', '15px'),
      fontSizeMini: cssVar('--text-2xs', '11px'),
      fontSizeTiny: cssVar('--text-xs', '12px'),
      fontSizeSmall: cssVar('--text-sm', '13px'),
      fontSizeMedium: cssVar('--text-base', '15px'),
      fontSizeLarge: cssVar('--text-lg', '17px'),
      fontSizeHuge: cssVar('--text-xl', '20px'),
      bodyColor: cssVar('--bg', '#f5f5ed'),
      cardColor: cssVar('--surface', '#fffcf7'),
      modalColor: cssVar('--surface', '#fffcf7'),
      popoverColor: cssVar('--surface', '#fffcf7'),
      tableColor: cssVar('--surface', '#fffcf7'),
      tableHeaderColor: cssVar('--surface-soft', '#f5f5ed'),
      inputColor: cssVar('--surface', '#fffcf7'),
      actionColor: cssVar('--surface-soft', '#f5f5ed'),
      hoverColor: cssVar('--brand-soft', 'rgba(31,122,103,0.12)'),
      dividerColor: cssVar('--line', '#e2e8f0'),
      borderColor: cssVar('--line', '#e2e8f0'),
      textColor1: cssVar('--text', '#142f2f'),
      textColor2: cssVar('--text-secondary', '#475569'),
      textColor3: cssVar('--muted', '#64748b'),
      placeholderColor: cssVar('--soft', '#94a3b8'),
      errorColor: cssVar('--danger', '#ef4444'),
      successColor: cssVar('--success', '#22c55e'),
      warningColor: cssVar('--color-warning', '#f59e0b'),
      infoColor: cssVar('--color-accent-cyan', '#8eb4a2'),
      heightMedium: cssVar('--control-height', '36px'),
      heightSmall: cssVar('--control-height-sm', '32px'),
      boxShadow1: `0 2px 8px color-mix(in srgb, ${cssVar('--text', '#000')} 6%, transparent)`,
      boxShadow2: `0 8px 24px color-mix(in srgb, ${cssVar('--text', '#000')} 10%, transparent)`,
    },
    Card: {
      borderRadius: radiusMd,
      color: cssVar('--surface', '#ffffff'),
      borderColor: cssVar('--line', '#e2e8f0'),
    },
    Button: {
      borderRadiusMedium: radius,
      borderRadiusSmall: radius,
      colorPrimary: brand,
      colorHoverPrimary: brandStrong,
      colorPressedPrimary: brandStrong,
    },
    Input: {
      borderRadius: radius,
      color: cssVar('--surface', '#ffffff'),
      border: `1px solid ${cssVar('--line', '#e2e8f0')}`,
    },
    Select: {
      peers: {
        InternalSelection: {
          borderRadius: radiusMd,
          border: `1px solid color-mix(in srgb, ${cssVar('--line', '#ddd5c4')} 88%, #1f7a67 12%)`,
          color: cssVar('--surface', '#fffcf7'),
          textColor: cssVar('--text', '#142f2f'),
          placeholderColor: cssVar('--soft', '#94a3b8'),
          boxShadowFocus: `0 0 0 3px color-mix(in srgb, ${brand} 14%, transparent)`,
        },
        InternalSelectMenu: {
          borderRadius: radiusMd,
          color: cssVar('--surface', '#ffffff'),
        },
      },
    },
    DataTable: {
      borderRadius: radiusMd,
      thColor: cssVar('--surface-soft', '#f8fafc'),
      tdColor: cssVar('--surface', '#ffffff'),
      borderColor: cssVar('--line', '#e2e8f0'),
    },
    Modal: {
      borderRadius: radiusMd,
      color: cssVar('--surface', '#ffffff'),
    },
    Tabs: {
      tabBorderRadius: radius,
      tabColor: cssVar('--surface-soft', '#f8fafc'),
      tabTextColorActive: brand,
      barColor: brand,
    },
    Tag: {
      borderRadius: radius,
    },
    Alert: {
      borderRadius: radius,
    },
    Checkbox: {
      borderRadius: '4px',
      colorChecked: brand,
    },
    Radio: {
      buttonColorActive: brand,
      dotColorActive: brand,
    },
    Spin: {
      color: brand,
    },
    Message: {
      borderRadius: radiusMd,
    },
    Notification: {
      borderRadius: radiusMd,
    },
  }
}

export function isDarkMode(): boolean {
  return document.documentElement.classList.contains('theme-dark')
}
