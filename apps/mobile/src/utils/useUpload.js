import { UploadClient } from '@uploadcare/upload-client';
import * as React from 'react';
const client = new UploadClient({ publicKey: process.env.EXPO_PUBLIC_UPLOADCARE_PUBLIC_KEY });

function useUpload() {
  const [loading, setLoading] = React.useState(false);
  const upload = React.useCallback(async (input) => {
    try {
      setLoading(true);
      const baseURL = process.env.EXPO_PUBLIC_BASE_URL || "";
      let response;
      if ('reactNativeAsset' in input && input.reactNativeAsset) {
        if (input.reactNativeAsset.file) {
          const formData = new FormData();
          formData.append('file', input.reactNativeAsset.file);
          const uploadUrl = baseURL ? `${baseURL}/_create/api/upload/` : "/_create/api/upload/";
          console.log(`[UPLOAD] Uploading to: ${uploadUrl}`);
          console.log(`[UPLOAD] File: ${input.reactNativeAsset.file.name || 'unknown'}`);
          response = await fetch(uploadUrl, {
            method: 'POST',
            body: formData,
          });
        } else {
          const presignUrl = baseURL ? `${baseURL}/_create/api/upload/presign/` : "/_create/api/upload/presign/";
          
          const response = await fetch(presignUrl, {
            method: 'POST',
          });
          const { secureSignature, secureExpire } = await response.json();
          const result = await client.uploadFile(input.reactNativeAsset, {
            fileName: input.reactNativeAsset.name ?? input.reactNativeAsset.uri.split('/').pop(),
            contentType: input.reactNativeAsset.mimeType,
            secureSignature,
            secureExpire,
          });
          return {
            url: `${process.env.EXPO_PUBLIC_BASE_CREATE_USER_CONTENT_URL}/${result.uuid}/`,
            mimeType: result.mimeType || null,
          };
        }
      } else if ('url' in input) {
        const uploadUrl = baseURL ? `${baseURL}/_create/api/upload/` : "/_create/api/upload/";
        response = await fetch(uploadUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ url: input.url }),
        });
      } else if ('base64' in input) {
        const uploadUrl = baseURL ? `${baseURL}/_create/api/upload/` : "/_create/api/upload/";
        response = await fetch(uploadUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ base64: input.base64 }),
        });
      } else {
        const uploadUrl = baseURL ? `${baseURL}/_create/api/upload/` : "/_create/api/upload/";
        response = await fetch(uploadUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/octet-stream',
          },
          body: input.buffer,
        });
      }
      const responseText = await response.text();
      console.log(`[UPLOAD] Status: ${response.status}`);
      console.log(`[UPLOAD] Content-Type: ${response.headers.get('content-type')}`);
      console.log(`[UPLOAD] Response (first 500 chars): ${responseText.substring(0, 500)}`);
      
      if (!response.ok) {
        if (response.status === 413) {
          throw new Error('Upload failed: File too large.');
        }
        console.error(`[UPLOAD] HTTP Error ${response.status}: ${responseText}`);
        throw new Error(`Upload failed: HTTP ${response.status}`);
      }
      
      try {
        const data = JSON.parse(responseText);
        console.log(`[UPLOAD] Success: ${data.url}`);
        return { url: data.url, mimeType: data.mimeType || null };
      } catch (parseErr) {
        console.error(`[UPLOAD] JSON Parse error: ${parseErr.message}`);
        console.error(`[UPLOAD] Response was: ${responseText}`);
        throw new Error(`Upload response invalid: ${parseErr.message}`);
      }
    } catch (uploadError) {
      if (uploadError instanceof Error) {
        return { error: uploadError.message };
      }
      if (typeof uploadError === 'string') {
        return { error: uploadError };
      }
      return { error: 'Upload failed' };
    } finally {
      setLoading(false);
    }
  }, []);

  return [upload, { loading }];
}

export { useUpload };
export default useUpload;
