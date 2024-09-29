import { useState } from 'react';
import { Obsession } from '../../common/types';
import {
  Box,
  Button,
  Card,
  Checkbox,
  Stack,
  Step,
  StepIndicator,
  Stepper,
  Typography,
} from '@mui/joy';
import StarIcon from '@mui/icons-material/Star'; // Importing a star icon
import Check from '@mui/icons-material/Check';
import One from '@mui/icons-material/OneK';

interface SkillSelectionGridProps {
  skills: string[];
  obsessions: Obsession[];
  onSubmit: (selectedSkills: string[], selectedObsession: Obsession) => void;
}

const SkillSelection: React.FC<SkillSelectionGridProps> = ({
  skills,
  obsessions,
  onSubmit,
}) => {
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
  const [selectedObsession, setSelectedObsession] = useState<Obsession | null>(
    null,
  );

  // Handle selection for skills
  const handleSkillClick = (skill: string) => {
    if (selectedSkills.includes(skill)) {
      setSelectedSkills(selectedSkills.filter(s => s !== skill));
    } else if (selectedSkills.length < 2) {
      setSelectedSkills([...selectedSkills, skill]);
    }
  };

  // Handle selection for obsession
  const handleObsessionClick = (obsession: Obsession) => {
    setSelectedObsession(obsession === selectedObsession ? null : obsession);
  };

  const handleSubmit = () => {
    if (selectedSkills.length === 2 && selectedObsession) {
      onSubmit(selectedSkills, selectedObsession);
    } else {
      alert('Please select exactly 2 skills and 1 obsession.');
    }
  };

  // Function to render stars based on rank
  const renderStars = (rank: number) => {
    return (
      <Box display="flex">
        {[...Array(rank)].map((_, index) => (
          <StarIcon
            key={index}
            color={'inherit'} // Fill stars based on rank
            sx={{ fontSize: 20 }} // Adjust size of stars
          />
        ))}
      </Box>
    );
  };

  const [step, setStep] = useState(0);

  return (
    <>
      <Stepper sx={{ width: '200px', mx: 'auto' }}>
        <Step
          indicator={
            <StepIndicator
              variant={step === 0 ? 'soft' : 'solid'}
              color="primary"
            />
          }
        >
          Skills
        </Step>
        <Step indicator={<StepIndicator variant={'soft'} color="primary" />}>
          Obsession
        </Step>
      </Stepper>
      {step === 0 ? (
        <>
          <Typography level="h1">Skills</Typography>
          <Typography>
            First, choose two skills. Your choice will improve John's abilities
            to perform actions related to those skills.
          </Typography>
          <Box
            display="grid"
            gridTemplateColumns="repeat(auto-fill, minmax(100px, 1fr))"
            gap={2}
            mt={1}
            sx={{
              overflowY: 'scroll',
              maxHeight: '300px',
            }}
          >
            {skills.map((skill, index) => (
              <Button
                key={index}
                variant={selectedSkills.includes(skill) ? 'solid' : 'soft'}
                onClick={() => handleSkillClick(skill)}
                sx={{
                  cursor: 'pointer',
                  padding: '16px',
                  textAlign: 'center',
                  alignSelf: 'center',
                  height: '80px',
                }}
              >
                {skill}
              </Button>
            ))}
          </Box>
          <Button
            sx={{ alignSelf: 'flex-right', marginLeft: 'auto', marginTop: 2 }}
            onClick={() => setStep(i => i + 1)}
            disabled={selectedSkills.length < 2}
          >
            Next
          </Button>
        </>
      ) : (
        <>
          <Typography level="h1">Obsession</Typography>
          <Typography>
            Next, choose an obsession. Each time you are able to influence John
            to satisfy your obsession, you will earn points proportional to the
            difficulty of the obsession (denoted by a star rating).
          </Typography>
          <Box
            display="grid"
            gridTemplateColumns="repeat(auto-fill, minmax(150px, 1fr))"
            gap={2}
            mt={1}
            sx={{
              overflowY: 'scroll',
              maxHeight: '300px',
            }}
          >
            {obsessions.map((obsession, index) => (
              <Button
                key={index}
                onClick={() => handleObsessionClick(obsession)}
                variant={selectedObsession === obsession ? 'solid' : 'soft'}
                sx={{
                  cursor: 'pointer',
                  padding: '16px',
                  textAlign: 'center',
                  alignSelf: 'center',
                  height: '120px',
                }}
              >
                {obsession.description}
                {renderStars(obsession.rank)}{' '}
                {/* Display stars based on rank */}
              </Button>
            ))}
          </Box>
          <Stack
            flexDirection="row"
            justifyContent="space-between"
            sx={{ marginTop: 2 }}
          >
            <Button variant="soft" onClick={() => setStep(n => n - 1)}>
              Back
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={selectedSkills.length !== 2 || !selectedObsession}
              sx={{
                backgroundColor: 'primary.main', // Default JoyUI primary color
                '&:hover': {
                  backgroundColor: 'primary.hover', // JoyUI hover color
                },
                '&:active': {
                  backgroundColor: 'primary.active', // JoyUI active color
                },
              }}
            >
              Submit Selection
            </Button>
          </Stack>
        </>
      )}
    </>
  );
};

export default SkillSelection;
