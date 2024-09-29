import { Typography, TypographySystem } from '@mui/joy';
import { FC, useEffect, useRef, useState } from 'react';

type Props = {
  keyframes: string[];
  periodMs: number;
  typographyLevel: keyof TypographySystem;
};

const AnimatedText: FC<Props> = ({ keyframes, periodMs, typographyLevel }) => {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setIndex(i => (i + 1) % keyframes.length);
    }, periodMs);

    return () => {
      clearInterval(interval);
    };
  }, []);

  return <Typography level={typographyLevel}>{keyframes[index]}</Typography>;
};

export default AnimatedText;
