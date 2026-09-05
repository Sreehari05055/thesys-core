import { Helmet } from "react-helmet-async";
import { OG_IMAGE_PATH, SITE_DESCRIPTION, SITE_NAME, pageTitle } from "@/lib/siteMeta";

type PageHeadProps = {
  title?: string;
  description?: string;
  noIndex?: boolean;
};

export function PageHead({
  title,
  description = SITE_DESCRIPTION,
  noIndex = false,
}: PageHeadProps) {
  const documentTitle = pageTitle(title);

  return (
    <Helmet>
      <title>{documentTitle}</title>
      <meta name="description" content={description} />
      <meta property="og:title" content={documentTitle} />
      <meta property="og:description" content={description} />
      <meta property="og:site_name" content={SITE_NAME} />
      <meta property="og:image" content={OG_IMAGE_PATH} />
      <meta name="twitter:title" content={documentTitle} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={OG_IMAGE_PATH} />
      {noIndex ? <meta name="robots" content="noindex, nofollow" /> : null}
    </Helmet>
  );
}
