import React from 'react';
import { Button, CircularProgress } from '@mui/material';

import { ButtonProps } from '@mui/material';

interface LoadingButtonProps extends ButtonProps {
  loading: boolean;
}

const LoadingButton: React.FC<LoadingButtonProps> = ({ loading, children, ...props }) => (
  <Button {...props} disabled={loading || props.disabled}>
    {loading ? <CircularProgress size={20} color="inherit" /> : children}
  </Button>
);

export default LoadingButton;
