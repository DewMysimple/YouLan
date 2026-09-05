// Component body preserved from ThreeUI's registered LandingPages.tsx.
import { LandingPageFrame, type LandingPageProps } from './vendor/LandingPageFrame';
import { splitTypographyProps, usePageTypography, type PageTypographyProps } from './vendor/pageTypography';
import { MENG_TO_SKETCHBOOK_TYPOGRAPHY } from './vendor/pageRecipes';

export function MengToSketchbookLandingPage(props: LandingPageProps & PageTypographyProps) {
  const [type, frame] = splitTypographyProps(props);
  const customization = usePageTypography(MENG_TO_SKETCHBOOK_TYPOGRAPHY, type);
  return <LandingPageFrame {...frame} customization={customization} title="Meng To — Singapore Sketchbook" sourceUrl="/landing-pages/meng-to-sketchbook.html" />;
}
