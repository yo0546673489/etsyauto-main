/**
 * Policy Compliance API Client
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? '';

function getAuthHeaders(): HeadersInit {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  return {
    'Content-Type': 'application/json',
    ...(token && { 'Authorization': `Bearer ${token}` }),
  };
}

export interface PolicyCheck {
  compliant: boolean;
  policy_status: string;
  policy_flags: string[];
  can_publish: boolean;
  remediation_required: boolean;
  checks: any;
  checked_at: string;
}

export const policyApi = {
  /**
   * Check policy compliance for a product
   */
  checkProduct: async (productId: number): Promise<PolicyCheck> => {
    const response = await fetch(`${API_URL}/api/policy/product/${productId}/check`, {
      headers: getAuthHeaders(),
    });
    
    if (!response.ok) {
      throw new Error('Failed to check policy');
    }
    
    return response.json();
  },

  /**
   * Re-check policy after content updates
   */
  recheckProduct: async (productId: number): Promise<PolicyCheck> => {
    const response = await fetch(`${API_URL}/api/policy/product/${productId}/recheck`, {
      method: 'POST',
      headers: getAuthHeaders(),
    });
    
    if (!response.ok) {
      throw new Error('Failed to re-check policy');
    }
    
    return response.json();
  },

  /**
   * Get policy status for a listing job
   */
  getJobPolicyStatus: async (jobId: number): Promise<any> => {
    const response = await fetch(`${API_URL}/api/policy/job/${jobId}/policy-status`, {
      headers: getAuthHeaders(),
    });
    
    if (!response.ok) {
      throw new Error('Failed to get policy status');
    }
    
    return response.json();
  },

  /**
   * Retry a policy-blocked job after remediation
   */
  retryAfterRemediation: async (jobId: number): Promise<any> => {
    const response = await fetch(`${API_URL}/api/policy/job/${jobId}/retry-after-remediation`, {
      method: 'POST',
      headers: getAuthHeaders(),
    });
    
    if (!response.ok) {
      throw new Error('Failed to retry job');
    }
    
    return response.json();
  },
};

