import { useEffect, useRef, useState } from 'react';
import { ImagePlus, Trash2, X } from 'lucide-react';
import UserAvatar from './UserAvatar.jsx';
import { IMAGE_ACCEPT, describeImageProblem, prepareImage } from '../utils/imageFiles.js';

const maxFileSize = 5 * 1024 * 1024;

export default function ProfilePictureUpload({
  currentImage,
  name,
  file,
  onFileChange,
  onRemove,
  disabled = false,
  uploading = false,
  uploadProgress = 0,
}) {
  const inputRef = useRef(null);
  const [validationError, setValidationError] = useState('');
  const [previewUrl, setPreviewUrl] = useState('');
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    if (!file) {
      setPreviewUrl('');
      return undefined;
    }

    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const selectImage = async (event) => {
    const selected = event.target.files?.[0];
    event.target.value = '';
    if (!selected) return;

    const problem = describeImageProblem(selected);
    if (problem) {
      setValidationError(`"${selected.name}" ${problem}`);
      onFileChange(null);
      return;
    }
    setProcessing(true);
    setValidationError('');
    const prepared = await prepareImage(selected, { maxDimension: 1200 });
    setProcessing(false);
    if (prepared.size > maxFileSize) {
      setValidationError(`"${selected.name}" is ${(prepared.size / (1024 * 1024)).toFixed(1)} MB. Profile pictures must be 5 MB or smaller.`);
      onFileChange(null);
      return;
    }
    onFileChange(prepared);
  };

  const cancelSelection = () => {
    onFileChange(null);
    setValidationError('');
    if (inputRef.current) inputRef.current.value = '';
  };

  return (
    <div className="profile-picture-upload">
      <UserAvatar
        src={previewUrl || currentImage}
        name={name}
        alt={name ? `${name} profile picture preview` : 'Profile picture preview'}
        className="profile-picture-preview"
      />
      <div className="profile-picture-controls">
        <div className="profile-picture-actions">
          <button type="button" className="btn btn-primary" onClick={() => inputRef.current?.click()} disabled={disabled || processing}>
            <ImagePlus size={17} aria-hidden="true" />
            {processing ? 'Preparing photo…' : currentImage ? 'Change Photo' : file ? 'Choose Another Photo' : 'Upload Photo'}
          </button>
          {file && <button type="button" className="btn btn-white" onClick={cancelSelection} disabled={disabled}><X size={16} aria-hidden="true" /> Cancel selection</button>}
          {currentImage && !file && <button type="button" className="btn btn-white profile-remove-photo" onClick={onRemove} disabled={disabled}><Trash2 size={16} aria-hidden="true" /> Remove Photo</button>}
        </div>
        <input
          ref={inputRef}
          className="profile-image-input"
          type="file"
          accept={IMAGE_ACCEPT}
          aria-label="Choose a profile picture"
          onChange={selectImage}
          disabled={disabled}
        />
        <p className="profile-picture-help">JPG, PNG, WebP or iPhone HEIC photos. Maximum file size: 5 MB (large photos are shrunk automatically).</p>
        {file && !uploading && <p className="profile-picture-help" aria-live="polite">{file.name} selected. Save changes to upload it.</p>}
        {validationError && <p className="profile-picture-error" role="alert">{validationError}</p>}
        {uploading && (
          <div className="profile-upload-progress">
            <span>Uploading photo… {uploadProgress}%</span>
            <div role="progressbar" aria-label="Profile photo upload progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow={uploadProgress}>
              <span style={{ width: `${uploadProgress}%` }} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
