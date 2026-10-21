import { useCallback, useEffect, useRef, useState } from 'react';
import { isDeveloperSectionUnlocked } from '@/utils/developerMode';

import {
  resolveSettingsSection,
  type SettingsSection,
} from '../settingsSections';

interface UseSettingsNavigationParams {
  initialSection?: string;
  /** Mount-only default; removing a consumed navigation target must preserve local selection. */
  defaultSection?: SettingsSection;
  navigationNonce?: number;
  floatingBallDevGate?: boolean;
  onSectionChange?: () => void;
}

export function useSettingsNavigation({
  initialSection,
  defaultSection = 'providers',
  navigationNonce,
  floatingBallDevGate,
  onSectionChange,
}: UseSettingsNavigationParams) {
  const onSectionChangeRef = useRef(onSectionChange);
  const floatingBallDisabled = floatingBallDevGate === false;
  const requestedSection = resolveSettingsSection(initialSection);

  useEffect(() => {
    onSectionChangeRef.current = onSectionChange;
  }, [onSectionChange]);

  const getInitialSection = (): SettingsSection => {
    if (requestedSection) {
      if (requestedSection === 'desktop-pet' && floatingBallDisabled) {
        return 'about';
      }
      if (requestedSection === 'developer' && !isDeveloperSectionUnlocked()) {
        return 'about';
      }
      return requestedSection;
    }
    return defaultSection;
  };

  const [activeSection, setActiveSection] = useState<SettingsSection>(getInitialSection);

  const notifySectionChange = useCallback(() => {
    onSectionChangeRef.current?.();
  }, []);

  useEffect(() => {
    if (requestedSection) {
      const timer = window.setTimeout(() => {
        if (requestedSection === 'desktop-pet' && floatingBallDisabled) {
          setActiveSection('about');
          notifySectionChange();
          return;
        }
        if (requestedSection === 'developer' && !isDeveloperSectionUnlocked()) {
          setActiveSection('about');
          notifySectionChange();
          return;
        }
        setActiveSection(requestedSection);
        notifySectionChange();
      }, 0);

      return () => {
        window.clearTimeout(timer);
      };
    }
  }, [floatingBallDisabled, initialSection, requestedSection, navigationNonce, notifySectionChange]);

  useEffect(() => {
    if (activeSection === 'desktop-pet' && floatingBallDisabled) {
      const timer = window.setTimeout(() => {
        setActiveSection('about');
      }, 0);

      return () => {
        window.clearTimeout(timer);
      };
    }
  }, [activeSection, floatingBallDisabled]);

  const navigateToProxySettings = useCallback(() => {
    setActiveSection('proxy');
  }, []);

  return {
    activeSection,
    setActiveSection,
    navigateToProxySettings,
    notifySectionChange,
  };
}
