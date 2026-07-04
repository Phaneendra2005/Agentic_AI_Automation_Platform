import { useEffect } from 'react';
import { useRouter } from 'next/router';
import useAuthStore from '@/store/authStore';

export default function ProtectedRoute({ children }) {
  const router = useRouter();
  const { isAuthenticated, isLoading, _hasHydrated } = useAuthStore();

  useEffect(() => {
    if (_hasHydrated && !isLoading && !isAuthenticated) {
      router.replace('/login');
    }
  }, [isAuthenticated, isLoading, _hasHydrated, router]);

  // Wait for Zustand to rehydrate from localStorage before deciding
  if (!_hasHydrated || isLoading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) return null;

  return children;
}
