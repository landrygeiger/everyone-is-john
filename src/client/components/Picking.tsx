import { FC, useContext } from 'react';
import { App } from '../../common/types';
import { Card, Typography } from '@mui/joy';
import SkillSelection from './SkillSelection';
import { StateContext } from '../State';
import { selectKit } from '../../common/api';
import AnimatedText from './AnimatedText';

const titleKeyframes = ['Waiting', 'Waiting.', 'Waiting..', 'Waiting...'];

type Props = {
  pickingState: Extract<App, { kind: 'pickingPeriod' }>;
};
const Picking: FC<Props> = ({ pickingState }) => {
  const { nickname } = useContext(StateContext);
  const me = pickingState.players.find(p => p.nickname === nickname)!;
  const doneSelecting = me.skills !== null && me.obsession !== null;

  return (
    <Card sx={{ width: 650, p: 3 }}>
      {doneSelecting ? (
        <>
          <AnimatedText
            typographyLevel="h1"
            keyframes={titleKeyframes}
            periodMs={1000}
          />
          <Typography>
            Give the other players a chance to choose their skills and
            obsessions!
          </Typography>
        </>
      ) : (
        <SkillSelection
          skills={me?.skillOptions ?? []}
          obsessions={me?.obsessionOptions ?? []}
          onSubmit={(selectedSkills, selectedObsession) =>
            selectKit({
              nickname: nickname ?? '',
              obsession: selectedObsession,
              skillOne: selectedSkills[0],
              skillTwo: selectedSkills[1],
            })
          }
        />
      )}
    </Card>
  );
};

export default Picking;
