/**
 * Example product photos on the landing page (step 60b). Real photographs under the free Unsplash
 * License (verified on each photo's page, 2026-10-10: "Free to use under the Unsplash License";
 * not Unsplash+), optimized to WebP in public/assets/photos. They illustrate EXAMPLE deals - every
 * card around them stays labelled illustrative / not a live listing. No people in any photo.
 * Register (source, photographer, hash): docs/LANDING_ASSETS.md. Credits: footer.
 */
export interface ProductPhoto {
  src: string;
  width: number;
  height: number;
  /** Describes the photo; marked as an example so it is never read as a live listing. */
  alt: string;
  credit: { author: string; profile: string; page: string };
}

export const productPhotos = {
  iphone13Pro: {
    src: "/assets/photos/iphone-13-pro-sierra-blue.webp",
    width: 1200,
    height: 1500,
    alt: "Example photo: an iPhone 13 Pro in Sierra Blue",
    credit: { author: "Luka Petranović", profile: "https://unsplash.com/@basically_luka", page: "https://unsplash.com/photos/_T8MeuamyT4" },
  },
  playstation5: {
    src: "/assets/photos/playstation-5.webp",
    width: 1200,
    height: 1800,
    alt: "Example photo: a PlayStation 5 console with its controller",
    credit: { author: "User_Pascal", profile: "https://unsplash.com/@user_pascal", page: "https://unsplash.com/photos/mth7yBmBQ84" },
  },
  iphoneListing1: {
    src: "/assets/photos/iphone-listing-1.webp",
    width: 480,
    height: 320,
    alt: "",
    credit: { author: "Onur Binay", profile: "https://unsplash.com/@onurbinay", page: "https://unsplash.com/photos/epM08OIfGqk" },
  },
  iphoneListing2: {
    src: "/assets/photos/iphone-listing-2.webp",
    width: 480,
    height: 360,
    alt: "",
    credit: { author: "Vanja Matijevic", profile: "https://unsplash.com/@vanjamphotos", page: "https://unsplash.com/photos/iTx4QUQyPWA" },
  },
  iphoneListing3: {
    src: "/assets/photos/iphone-listing-3.webp",
    width: 480,
    height: 320,
    alt: "",
    credit: { author: "Amjith S", profile: "https://unsplash.com/@amjiths", page: "https://unsplash.com/photos/vRRYyCd2TDE" },
  },
} as const satisfies Record<string, ProductPhoto>;

/** One credit per photographer, in page order. */
export const photoCredits = Object.values(productPhotos).map((p) => p.credit);
