import { useEffect, useId, useRef, useState } from 'react';
import { ImagePlus, Replace, Upload, X } from 'lucide-react';
import { resolveImageUrl } from '../utils/imageUrl.js';

const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);

export default function ImageUpload({
  existingImages,
  onExistingImagesChange,
  files,
  onFilesChange,
  disabled = false,
  error = '',
  onError,
  maxFiles = 10,
  maxSizeMb = 5,
}) {
  const inputId = useId();
  const fileInput = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [previews, setPreviews] = useState([]);
  const totalImages = existingImages.length + files.length;

  useEffect(() => {
    const next = files.map((file) => ({ file, url: URL.createObjectURL(file) }));
    setPreviews(next);
    return () => next.forEach(({ url }) => URL.revokeObjectURL(url));
  }, [files]);

  const addFiles = (fileList) => {
    const selected = Array.from(fileList || []);
    if (!selected.length) return;
    const availableSlots = maxFiles - totalImages;
    const valid = [];
    for (const file of selected) {
      if (!allowedTypes.has(file.type)) {
        onError('Choose JPG, PNG, or WebP image files only.');
        return;
      }
      if (file.size > maxSizeMb * 1024 * 1024) {
        onError(`Each image must be ${maxSizeMb} MB or smaller.`);
        return;
      }
      valid.push(file);
    }
    if (valid.length > availableSlots) {
      onError(`You can add up to ${maxFiles} images. Remove an image before adding more.`);
      return;
    }
    onError('');
    onFilesChange((current) => [...current, ...valid]);
  };

  const replaceAll = () => {
    onExistingImagesChange([]);
    onFilesChange([]);
    onError('');
  };

  return (
    <section className="image-upload-section" aria-labelledby={`${inputId}-heading`}>
      <div className="image-upload-heading">
        <div><h2 id={`${inputId}-heading`}>Product images <span className="image-upload-optional">Optional</span></h2><p className="muted">Add up to {maxFiles} images. JPG, PNG or WebP, up to {maxSizeMb} MB each.</p></div>
        {totalImages > 0 && <button className="image-upload-replace" type="button" onClick={replaceAll} disabled={disabled}><Replace size={16} /> Replace all</button>}
      </div>
      <div
        className={`image-upload-dropzone${dragging ? ' is-dragging' : ''}${disabled ? ' is-disabled' : ''}`}
        onDragEnter={(event) => { event.preventDefault(); if (!disabled) setDragging(true); }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setDragging(false); }}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          if (!disabled) addFiles(event.dataTransfer.files);
        }}
      >
        <span className="image-upload-icon"><ImagePlus size={24} /></span>
        <p><strong>Upload product images</strong></p>
        <p className="muted">Drag and drop images here or browse your device</p>
        <button className="btn btn-white image-upload-browse" type="button" disabled={disabled || totalImages >= maxFiles} onClick={() => fileInput.current?.click()}><Upload size={16} /> Browse images</button>
        <input
          ref={fileInput}
          id={inputId}
          className="image-upload-input"
          type="file"
          accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
          multiple
          disabled={disabled || totalImages >= maxFiles}
          aria-label="Select product images"
          onChange={(event) => {
            addFiles(event.target.files);
            event.target.value = '';
          }}
        />
      </div>
      {error && <p className="image-upload-error" role="alert">{error}</p>}
      {totalImages > 0 && (
        <div className="image-preview-grid" aria-label="Selected product images">
          {existingImages.map((image, index) => (
            <figure className="image-preview" key={`existing-${image}-${index}`}>
              <img src={resolveImageUrl(image)} alt={`Product image ${index + 1}`} />
              <button type="button" aria-label={`Remove product image ${index + 1}`} disabled={disabled} onClick={() => onExistingImagesChange((current) => current.filter((_, itemIndex) => itemIndex !== index))}><X size={16} /></button>
              <figcaption>Image {index + 1}</figcaption>
            </figure>
          ))}
          {previews.map(({ file, url }, index) => (
            <figure className="image-preview" key={`${file.name}-${file.lastModified}-${index}`}>
              <img src={url} alt={`Selected image ${existingImages.length + index + 1}: ${file.name}`} />
              <button type="button" aria-label={`Remove ${file.name}`} disabled={disabled} onClick={() => onFilesChange((current) => current.filter((_, fileIndex) => fileIndex !== index))}><X size={16} /></button>
              <figcaption>{file.name}</figcaption>
            </figure>
          ))}
        </div>
      )}
      {!totalImages && <p className="image-upload-empty">No product images selected yet.</p>}
    </section>
  );
}
